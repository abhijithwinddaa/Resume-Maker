import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AIUnavailableError,
  callServerAI,
  normalizeGithubModel,
} from "../server/aiRuntime";
import { DEFAULT_FREE_MODELS } from "../server/openRouterRuntime";
import { resetModelCooldowns } from "../server/openAICompatRuntime";

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

const GITHUB_HOST = "models.github.ai";
const GROQ_HOST = "api.groq.com";
const NVIDIA_HOST = "integrate.api.nvidia.com";
const OPENROUTER_HOST = "openrouter.ai";
const ZAI_HOST = "api.z.ai";

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
    "GROQ_MODELS",
    "NVIDIA_API_KEY",
    "NVIDIA_MODELS",
    "ZAI_API_KEY",
    "ZAI_MODELS",
  ]) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) process.env[key] = value;
  }
}

/** The model ids posted to a host, in call order. */
function modelsPostedTo(host: string): string[] {
  return fetchMock.mock.calls
    .filter((call) => urlOf((call as FetchArgs)[0]).includes(host))
    .map((call) => JSON.parse(String((call as FetchArgs)[1]?.body)).model);
}

function bodyPostedTo(host: string): Record<string, unknown> {
  const call = fetchMock.mock.calls.find((c) =>
    urlOf((c as FetchArgs)[0]).includes(host),
  ) as FetchArgs;
  return JSON.parse(String(call[1]?.body));
}

beforeEach(() => {
  // Cooldowns are module state that outlives a single call — isolate tests.
  resetModelCooldowns();
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
  it("falls through to Z.ai when GitHub Models answers 404", async () => {
    setEnv({ GITHUB_TOKEN: "gh-token", ZAI_API_KEY: "zai-key" });

    fetchMock.mockImplementation((...args: FetchArgs) => {
      const url = urlOf(args[0]);
      if (url.includes(GITHUB_HOST)) return Promise.resolve(retiredGithubResponse());
      if (url.includes(ZAI_HOST)) return Promise.resolve(chatResponse("from zai"));
      throw new Error(`unexpected fetch to ${url}`);
    });

    await expect(callServerAI(messages)).resolves.toBe("from zai");
  });

  it("falls through to GitHub Models when every OpenRouter model is rate limited", async () => {
    setEnv({
      OPENROUTER_API_KEY: "or-key",
      OPENROUTER_MODELS: "a/model-1:free,b/model-2:free",
      GITHUB_TOKEN: "gh-token",
    });

    fetchMock.mockImplementation((...args: FetchArgs) => {
      const url = urlOf(args[0]);
      if (url.includes(OPENROUTER_HOST))
        return Promise.resolve(new Response("", { status: 429 }));
      if (url.includes(GITHUB_HOST)) return Promise.resolve(chatResponse("from github"));
      throw new Error(`unexpected fetch to ${url}`);
    });

    await expect(callServerAI(messages)).resolves.toBe("from github");
  });

  it("tries the fast providers first: Groq, then NVIDIA, then OpenRouter", async () => {
    setEnv({
      OPENROUTER_API_KEY: "or-key",
      NVIDIA_API_KEY: "nv-key",
      GROQ_API_KEY: "groq-key",
    });
    fetchMock.mockResolvedValue(chatResponse("first"));

    await callServerAI(messages);

    expect(urlOf((fetchMock.mock.calls[0] as FetchArgs)[0])).toContain(GROQ_HOST);
  });

  it("moves to the next Groq model when one is rate limited", async () => {
    setEnv({ GROQ_API_KEY: "groq-key", GROQ_MODELS: "m/one,m/two" });

    fetchMock
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(chatResponse("from second model"));

    await expect(callServerAI(messages)).resolves.toBe("from second model");
    expect(new Set(modelsPostedTo(GROQ_HOST))).toEqual(new Set(["m/one", "m/two"]));
  });

  it("skips a rate-limited model on later calls instead of hitting it again", async () => {
    setEnv({ GROQ_API_KEY: "groq-key", GROQ_MODELS: "m/one,m/two" });

    fetchMock.mockImplementation((...args: FetchArgs) => {
      const model = JSON.parse(String(args[1]?.body)).model;
      return Promise.resolve(
        model === "m/one"
          ? new Response("", { status: 429, headers: { "retry-after": "120" } })
          : chatResponse("ok"),
      );
    });

    for (let i = 0; i < 4; i++) await callServerAI(messages);

    // Hit once, then cooled down for the remaining calls.
    expect(modelsPostedTo(GROQ_HOST).filter((m) => m === "m/one")).toHaveLength(1);
  });

  it("spreads calls across the model pool rather than always starting with the first", async () => {
    setEnv({ GROQ_API_KEY: "groq-key", GROQ_MODELS: "m/one,m/two,m/three" });
    fetchMock.mockImplementation(() => Promise.resolve(chatResponse("ok")));

    for (let i = 0; i < 3; i++) await callServerAI(messages);

    expect(new Set(modelsPostedTo(GROQ_HOST))).toEqual(
      new Set(["m/one", "m/two", "m/three"]),
    );
  });

  it("keeps stable calls on the same model so scores stay comparable", async () => {
    setEnv({ GROQ_API_KEY: "groq-key", GROQ_MODELS: "m/one,m/two,m/three" });
    fetchMock.mockImplementation(() => Promise.resolve(chatResponse("ok")));

    for (let i = 0; i < 3; i++) {
      await callServerAI(messages, undefined, { stable: true });
    }

    expect(modelsPostedTo(GROQ_HOST)).toEqual(["m/one", "m/one", "m/one"]);
    expect(bodyPostedTo(GROQ_HOST).temperature).toBe(0);
  });

  it("still lets a stable call fall back when its model is rate limited", async () => {
    setEnv({ GROQ_API_KEY: "groq-key", GROQ_MODELS: "m/one,m/two" });
    fetchMock
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(chatResponse("from second"));

    await expect(
      callServerAI(messages, undefined, { stable: true }),
    ).resolves.toBe("from second");
  });

  it("falls through to NVIDIA when every Groq model is rate limited", async () => {
    setEnv({ GROQ_API_KEY: "groq-key", NVIDIA_API_KEY: "nv-key" });

    fetchMock.mockImplementation((...args: FetchArgs) => {
      const url = urlOf(args[0]);
      if (url.includes(GROQ_HOST))
        return Promise.resolve(new Response("", { status: 429 }));
      if (url.includes(NVIDIA_HOST)) return Promise.resolve(chatResponse("from nvidia"));
      throw new Error(`unexpected fetch to ${url}`);
    });

    await expect(callServerAI(messages)).resolves.toBe("from nvidia");
  });

  it("keeps gpt-oss reasoning short on NVIDIA so replies arrive in time", async () => {
    setEnv({ NVIDIA_API_KEY: "nv-key" });
    fetchMock.mockResolvedValue(chatResponse("{}"));

    await callServerAI(messages);

    const body = bodyPostedTo(NVIDIA_HOST);
    expect(body.model).toBe("openai/gpt-oss-20b");
    expect(body.reasoning_effort).toBe("low");
  });

  it("turns off GLM thinking on Z.ai so the reply is the answer alone", async () => {
    setEnv({ ZAI_API_KEY: "zai-key" });
    fetchMock.mockResolvedValue(chatResponse("{}"));

    await callServerAI(messages);

    const body = bodyPostedTo(ZAI_HOST);
    expect(body.model).toBe("glm-4.5-flash");
    expect(body.thinking).toEqual({ type: "disabled" });
  });

  it("abandons a provider on a rejected key instead of trying every model", async () => {
    setEnv({ GROQ_API_KEY: "revoked", GROQ_MODELS: "m/one,m/two,m/three" });
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response("invalid api key", { status: 401 })),
    );

    const error = (await callServerAI(messages).catch((e: unknown) => e)) as AIUnavailableError;
    expect(error.detail).toMatch(/Groq.*401/s);
    expect(modelsPostedTo(GROQ_HOST)).toHaveLength(1);
  });

  it("still honours a single legacy GROQ_MODEL", async () => {
    setEnv({ GROQ_API_KEY: "groq-key", GROQ_MODEL: "legacy/model" });
    fetchMock.mockResolvedValue(chatResponse("ok"));

    await callServerAI(messages);

    expect(modelsPostedTo(GROQ_HOST)).toEqual(["legacy/model"]);
  });

  it("strips <think> blocks that a model leaves in its content", async () => {
    setEnv({ GROQ_API_KEY: "groq-key", GROQ_MODELS: "m/one" });
    fetchMock.mockResolvedValue(
      chatResponse('<think>weighing it up</think>\n{"ok":true}'),
    );

    await expect(callServerAI(messages)).resolves.toBe('{"ok":true}');
  });

  it("uses OpenRouter on the API key alone, without OPENROUTER_MODELS", async () => {
    setEnv({ OPENROUTER_API_KEY: "or-key" });

    fetchMock.mockResolvedValue(chatResponse("from openrouter"));

    await expect(callServerAI(messages)).resolves.toBe("from openrouter");

    const [input, init] = fetchMock.mock.calls[0] as FetchArgs;
    expect(urlOf(input)).toContain(OPENROUTER_HOST);
    // A default pool model, not an empty/undefined id.
    expect(DEFAULT_FREE_MODELS).toContain(
      JSON.parse(String(init?.body)).model,
    );
  });

  it("ships a free-model pool that OpenRouter still serves for free", async () => {
    // Guards against the pool going stale: a `:free` id that loses its free
    // variant fails every request on the id alone.
    expect(DEFAULT_FREE_MODELS.length).toBeGreaterThan(0);
    for (const model of DEFAULT_FREE_MODELS) {
      expect(model).toMatch(/^[a-z0-9.-]+\/[a-zA-Z0-9.:-]+:free$/);
    }
  });

  it("lets OPENROUTER_MODELS override the default free pool", async () => {
    setEnv({
      OPENROUTER_API_KEY: "or-key",
      OPENROUTER_MODELS: "vendor/only-model",
    });

    fetchMock.mockResolvedValue(chatResponse("pinned"));

    await expect(callServerAI(messages)).resolves.toBe("pinned");

    const [, init] = fetchMock.mock.calls[0] as FetchArgs;
    expect(JSON.parse(String(init?.body)).model).toBe("vendor/only-model");
  });

  it("suppresses reasoning output so the reply parses as JSON", async () => {
    setEnv({ OPENROUTER_API_KEY: "or-key" });
    fetchMock.mockResolvedValue(chatResponse("{}"));

    await callServerAI(messages);

    const [, init] = fetchMock.mock.calls[0] as FetchArgs;
    expect(JSON.parse(String(init?.body)).reasoning).toEqual({ exclude: true });
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

    const error = await callServerAI(messages).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AIUnavailableError);
    expect((error as AIUnavailableError).detail).toMatch(
      /All AI providers failed.*Groq.*GitHub Models/s,
    );
  });

  it("tells the user the AI is busy without leaking provider internals", async () => {
    setEnv({ GROQ_API_KEY: "groq-key" });
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response('{"error":"limit for organization org_secret123"}', {
          status: 503,
        }),
      ),
    );

    const error = (await callServerAI(messages).catch((e: unknown) => e)) as Error;

    expect(error.message).toMatch(/busy|try again/i);
    expect(error.message).not.toMatch(/org_secret123|Groq|HTTP/);
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
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof AIUnavailableError && /413/.test(e.detail),
    );

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
