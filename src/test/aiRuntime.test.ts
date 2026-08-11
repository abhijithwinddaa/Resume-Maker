import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callServerAI, normalizeGithubModel } from "../server/aiRuntime";

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

const GITHUB_HOST = "models.github.ai";
const GROQ_HOST = "api.groq.com";
const OPENROUTER_HOST = "openrouter.ai";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function chatResponse(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/** Reproduces the retired GitHub Models host: an empty-bodied 404. */
function retiredGithubResponse(): Response {
  return new Response("", { status: 404 });
}

const messages = [{ role: "user" as const, content: "hi" }];

let originalEnv: Record<string, string | undefined>;
let fetchMock: ReturnType<typeof vi.fn>;

function setEnv(vars: Record<string, string | undefined>): void {
  for (const key of [
    "OPENROUTER_API_KEY",
    "OPENROUTER_MODELS",
    "GITHUB_TOKEN",
    "GITHUB_TOKENS",
    "GITHUB_MODEL",
    "GROQ_API_KEY",
    "GROQ_MODEL",
  ]) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) process.env[key] = value;
  }
}

beforeEach(() => {
  originalEnv = { ...process.env };
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  // The chain sleeps between retries; keep the suite fast.
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((
    cb: () => void,
  ) => {
    cb();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.env = originalEnv;
});

describe("normalizeGithubModel", () => {
  it("qualifies bare model ids with their publisher", () => {
    expect(normalizeGithubModel("gpt-4o-mini")).toBe("openai/gpt-4o-mini");
    expect(normalizeGithubModel("Meta-Llama-3.1-70B-Instruct")).toBe(
      "meta/Meta-Llama-3.1-70B-Instruct",
    );
    expect(normalizeGithubModel("Mistral-Large-2411")).toBe(
      "mistral-ai/Mistral-Large-2411",
    );
  });

  it("leaves already-qualified ids untouched", () => {
    expect(normalizeGithubModel("openai/gpt-4o")).toBe("openai/gpt-4o");
  });
});

describe("callServerAI provider fallback", () => {
  it("falls through to Groq when GitHub Models answers 404", async () => {
    setEnv({ GITHUB_TOKEN: "gh-token", GROQ_API_KEY: "groq-key" });

    fetchMock.mockImplementation((...args: FetchArgs) => {
      const url = urlOf(args[0]);
      if (url.includes(GITHUB_HOST)) return Promise.resolve(retiredGithubResponse());
      if (url.includes(GROQ_HOST)) return Promise.resolve(chatResponse("from groq"));
      throw new Error(`unexpected fetch to ${url}`);
    });

    await expect(callServerAI(messages)).resolves.toBe("from groq");
    expect(
      fetchMock.mock.calls.some((call) =>
        urlOf((call as FetchArgs)[0]).includes(GROQ_HOST),
      ),
    ).toBe(true);
  });

  it("falls through to Groq when every OpenRouter model is rate limited", async () => {
    setEnv({
      OPENROUTER_API_KEY: "or-key",
      OPENROUTER_MODELS: "a/model-1:free,b/model-2:free",
      GROQ_API_KEY: "groq-key",
    });

    fetchMock.mockImplementation((...args: FetchArgs) => {
      const url = urlOf(args[0]);
      if (url.includes(OPENROUTER_HOST))
        return Promise.resolve(new Response("", { status: 429 }));
      if (url.includes(GROQ_HOST)) return Promise.resolve(chatResponse("from groq"));
      throw new Error(`unexpected fetch to ${url}`);
    });

    await expect(callServerAI(messages)).resolves.toBe("from groq");
  });

  it("posts a publisher-qualified model id to GitHub Models", async () => {
    setEnv({ GITHUB_TOKEN: "gh-token", GITHUB_MODEL: "gpt-4o-mini" });

    fetchMock.mockResolvedValue(chatResponse("from github"));

    await expect(callServerAI(messages)).resolves.toBe("from github");

    const [input, init] = fetchMock.mock.calls[0] as FetchArgs;
    expect(urlOf(input)).toBe(
      "https://models.github.ai/inference/chat/completions",
    );
    expect(JSON.parse(String(init?.body)).model).toBe("openai/gpt-4o-mini");
  });

  it("reports every provider failure when the whole chain is exhausted", async () => {
    setEnv({ GITHUB_TOKEN: "gh-token", GROQ_API_KEY: "groq-key" });

    fetchMock.mockImplementation((...args: FetchArgs) => {
      const url = urlOf(args[0]);
      if (url.includes(GITHUB_HOST)) return Promise.resolve(retiredGithubResponse());
      return Promise.resolve(new Response("upstream down", { status: 503 }));
    });

    await expect(callServerAI(messages)).rejects.toThrow(
      /All AI providers failed.*GitHub Models.*Groq/s,
    );
  });

  it("sends the caller's token budget rather than a blanket maximum", async () => {
    setEnv({ GROQ_API_KEY: "groq-key" });
    fetchMock.mockResolvedValue(chatResponse("ok"));

    await callServerAI(messages, undefined, { maxTokens: 2500 });

    const [, init] = fetchMock.mock.calls[0] as FetchArgs;
    expect(JSON.parse(String(init?.body)).max_tokens).toBe(2500);
  });

  it("retries with a smaller budget when Groq rejects the request as too large", async () => {
    setEnv({ GROQ_API_KEY: "groq-key" });

    // Groq counts input + max_tokens against its per-minute cap.
    const tooLarge = () =>
      new Response(
        JSON.stringify({
          error: { message: "Request too large ... Limit 12000, Requested 18412" },
        }),
        { status: 413 },
      );

    fetchMock
      .mockResolvedValueOnce(tooLarge())
      .mockResolvedValueOnce(chatResponse("fits now"));

    await expect(
      callServerAI(messages, undefined, { maxTokens: 6000 }),
    ).resolves.toBe("fits now");

    const budgets = fetchMock.mock.calls.map(
      (call) => JSON.parse(String((call as FetchArgs)[1]?.body)).max_tokens,
    );
    expect(budgets).toEqual([6000, 3000]);
  });

  it("gives up on 413 rather than shrinking the budget indefinitely", async () => {
    setEnv({ GROQ_API_KEY: "groq-key" });
    // A fresh Response per call — a body can only be read once.
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response("too large", { status: 413 })),
    );

    await expect(
      callServerAI(messages, undefined, { maxTokens: 6000 }),
    ).rejects.toThrow(/All AI providers failed.*413/s);

    // One initial attempt plus a bounded number of shrinking retries.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(9);
  });

  it("does not spend the remaining providers on an aborted request", async () => {
    setEnv({ GITHUB_TOKEN: "gh-token", GROQ_API_KEY: "groq-key" });

    const abortError = new Error("The operation was aborted.");
    abortError.name = "AbortError";
    fetchMock.mockRejectedValue(abortError);

    await expect(callServerAI(messages)).rejects.toThrow(
      "The operation was aborted.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
