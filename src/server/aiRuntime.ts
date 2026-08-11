import { callOpenRouter } from "./openRouterRuntime.js";
import type { OpenRouterConfig } from "./openRouterRuntime.js";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatAPIResponse {
  choices: { message: { content: string } }[];
}

interface GroqResponse {
  choices?: { message?: { content?: string } }[];
}

type EnvMap = Record<string, string | undefined>;

interface ServerAIConfig extends OpenRouterConfig {
  githubTokens: string[];
  githubModel: string;
  groqApiKey: string;
  groqModel: string;
}

interface ProviderFailure {
  provider: string;
  message: string;
}

export interface CallOptions {
  /**
   * Completion budget for this operation.
   *
   * Providers bill this against their rate limit *before* generating: Groq's
   * free tier counts `input + max_tokens` toward its 12k tokens-per-minute
   * cap, so an oversized budget gets a request rejected (413) on size alone,
   * no matter how short the reply actually is. Size it to the response you
   * expect, not to the context window.
   */
  maxTokens?: number;
}

/** Enough for a mid-sized JSON reply; individual routes override it. */
const DEFAULT_MAX_TOKENS = 3000;

/** Groq rejects a request whose reserved budget alone breaks the cap. */
const MIN_MAX_TOKENS = 800;

/**
 * GitHub Models retired the Azure inference host — it now answers every request
 * with an empty-bodied 404. The current host is models.github.ai and it expects
 * fully-qualified `publisher/model` ids.
 */
const GITHUB_MODELS_ENDPOINT =
  "https://models.github.ai/inference/chat/completions";

const ALL_PROVIDERS_FAILED_PREFIX = "All AI providers failed";

/** Sentinel messages thrown by provider clients, rewritten for the end user. */
const FAILURE_ALIASES: Record<string, string> = {
  ALL_OPENROUTER_RATE_LIMITED: "every configured model was rate limited",
};

const GITHUB_MODEL_PUBLISHER_PREFIXES: [RegExp, string][] = [
  [/^(gpt|o\d|text-embedding)/i, "openai"],
  [/^(meta-)?llama/i, "meta"],
  [/^mistral|^ministral|^codestral/i, "mistral-ai"],
  [/^phi|^mai-/i, "microsoft"],
  [/^cohere|^command/i, "cohere"],
  [/^deepseek/i, "deepseek"],
  [/^(ai21|jamba)/i, "ai21-labs"],
  [/^grok/i, "xai"],
];

let currentTokenIndex = 0;

function getEnvMap(): EnvMap {
  return (
    (
      globalThis as typeof globalThis & {
        process?: { env?: EnvMap };
      }
    ).process?.env || {}
  );
}

function readEnv(...keys: string[]): string {
  const env = getEnvMap();
  for (const key of keys) {
    const value = env[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function readGithubTokens(): string[] {
  const env = getEnvMap();
  const multiTokenValues = [env.GITHUB_TOKENS, env.GITHUB_TOKEN]
    .filter((value): value is string => Boolean(value && value.trim()))
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(multiTokenValues)];
}

function readOpenRouterModels(): string[] {
  const raw = readEnv("OPENROUTER_MODELS");
  if (!raw) return [];
  return raw
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

/** Qualify a bare model id (`gpt-4o-mini`) with its publisher (`openai/gpt-4o-mini`). */
export function normalizeGithubModel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed || trimmed.includes("/")) return trimmed;

  for (const [pattern, publisher] of GITHUB_MODEL_PUBLISHER_PREFIXES) {
    if (pattern.test(trimmed)) {
      return `${publisher}/${trimmed}`;
    }
  }

  return `openai/${trimmed}`;
}

function getServerAIConfig(): ServerAIConfig {
  return {
    openRouterApiKey: readEnv("OPENROUTER_API_KEY"),
    openRouterModels: readOpenRouterModels(),
    githubTokens: readGithubTokens(),
    githubModel: normalizeGithubModel(
      readEnv("GITHUB_MODEL") || "gpt-4o-mini",
    ),
    groqApiKey: readEnv("GROQ_API_KEY"),
    groqModel: readEnv("GROQ_MODEL") || "llama-3.3-70b-versatile",
  };
}

async function callGitHub(
  config: ServerAIConfig,
  messages: ChatMessage[],
  maxTokens: number,
  signal?: AbortSignal,
): Promise<string> {
  if (config.githubTokens.length === 0) {
    throw new Error("GitHub token is not configured on the server.");
  }

  let lastFailure = "no tokens attempted";

  for (let attempt = 0; attempt < config.githubTokens.length; attempt++) {
    signal?.throwIfAborted();

    const idx = (currentTokenIndex + attempt) % config.githubTokens.length;
    const token = config.githubTokens[idx];
    const response = await fetch(GITHUB_MODELS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.githubModel,
        messages,
        temperature: 0.3,
        max_tokens: maxTokens,
      }),
      signal,
    });

    if (response.ok) {
      currentTokenIndex = idx;
      const data = (await response.json()) as ChatAPIResponse;
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        lastFailure = "returned an empty response";
        continue;
      }
      return content;
    }

    // 401/429 are per-token; every other status (404/410 during the GitHub
    // Models retirement, 5xx, …) is provider-wide. Either way another token
    // is cheap to try, and the chain falls through to the next provider.
    const errBody = (await response.text()).slice(0, 300);
    lastFailure = `HTTP ${response.status}${errBody ? `: ${errBody}` : ""}`;
    console.warn(
      `[GitHub Models] token ${idx + 1}/${config.githubTokens.length} failed — ${lastFailure}`,
    );
  }

  throw new Error(`All GitHub tokens failed (${lastFailure}).`);
}

async function callGroq(
  config: ServerAIConfig,
  messages: ChatMessage[],
  maxTokens: number,
  signal?: AbortSignal,
): Promise<string> {
  if (!config.groqApiKey) {
    throw new Error("Groq API key is not configured on the server.");
  }

  let budget = maxTokens;

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.groqModel,
          messages,
          temperature: 0.3,
          max_tokens: budget,
        }),
        signal,
      },
    );

    if (response.ok) {
      const data = (await response.json()) as GroqResponse;
      const text = data.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error("Groq returned no content.");
      }
      return text;
    }

    const errBody = (await response.text()).slice(0, 300);

    // 413 means input + reserved budget broke the per-minute cap. Retrying
    // unchanged can only fail again, so trade completion headroom for a reply
    // that fits — but only while the budget is the part worth shrinking.
    if (response.status === 413 && budget > MIN_MAX_TOKENS && attempt < 2) {
      budget = Math.max(MIN_MAX_TOKENS, Math.floor(budget / 2));
      console.warn(
        `[Groq] request too large — retrying with max_tokens=${budget}`,
      );
      continue;
    }

    throw new Error(`Groq API error (${response.status}): ${errBody}`);
  }
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === maxRetries || !isRetryable(lastError)) {
        throw lastError;
      }

      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error("Unknown AI runtime failure.");
}

function isRetryable(error: Error): boolean {
  // An aborted request and a fully-exhausted provider chain will both fail the
  // same way on every retry — only pay the backoff for transient failures.
  if (error.name === "AbortError") return false;
  return !error.message.startsWith(ALL_PROVIDERS_FAILED_PREFIX);
}

function describeFailures(failures: ProviderFailure[]): string {
  if (failures.length === 0) {
    return "No server-side AI provider is configured. Set OPENROUTER_API_KEY, GITHUB_TOKEN, GITHUB_TOKENS, or GROQ_API_KEY.";
  }

  const detail = failures
    .map(
      ({ provider, message }) =>
        `${provider} — ${FAILURE_ALIASES[message] || message}`,
    )
    .join("; ");
  return `${ALL_PROVIDERS_FAILED_PREFIX}. ${detail}`;
}

export async function callServerAI(
  messages: ChatMessage[],
  signal?: AbortSignal,
  options: CallOptions = {},
): Promise<string> {
  const config = getServerAIConfig();
  const maxTokens = Math.max(
    MIN_MAX_TOKENS,
    options.maxTokens ?? DEFAULT_MAX_TOKENS,
  );

  return withRetry(async () => {
    signal?.throwIfAborted();

    const providers: {
      name: string;
      enabled: boolean;
      call: () => Promise<string>;
    }[] = [
      {
        name: "OpenRouter",
        enabled: Boolean(
          config.openRouterApiKey && config.openRouterModels.length > 0,
        ),
        call: () => callOpenRouter(config, messages, maxTokens, signal),
      },
      {
        name: "GitHub Models",
        enabled: config.githubTokens.length > 0,
        call: () => callGitHub(config, messages, maxTokens, signal),
      },
      {
        name: "Groq",
        enabled: Boolean(config.groqApiKey),
        call: () => callGroq(config, messages, maxTokens, signal),
      },
    ];

    const failures: ProviderFailure[] = [];

    for (const provider of providers) {
      if (!provider.enabled) continue;

      try {
        return await provider.call();
      } catch (error) {
        // An aborted request is the caller giving up, not a provider fault —
        // never burn the remaining providers on it.
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }

        const message =
          error instanceof Error ? error.message : String(error);
        failures.push({ provider: provider.name, message });
        console.warn(
          `[AI] ${provider.name} failed — falling through to the next provider: ${message}`,
        );
      }
    }

    throw new Error(describeFailures(failures));
  });
}
