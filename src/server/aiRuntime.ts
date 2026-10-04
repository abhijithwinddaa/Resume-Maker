import { callOpenRouter, DEFAULT_FREE_MODELS } from "./openRouterRuntime.js";
import type { OpenRouterConfig } from "./openRouterRuntime.js";
import { callOpenAICompatible } from "./openAICompatRuntime.js";
import type { CompatProvider } from "./openAICompatRuntime.js";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatAPIResponse {
  choices: { message: { content: string } }[];
}

type EnvMap = Record<string, string | undefined>;

interface ServerAIConfig extends OpenRouterConfig {
  githubTokens: string[];
  githubModel: string;
  groq: CompatProvider;
  nvidia: CompatProvider;
  zai: CompatProvider;
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
  /**
   * Pin the model and use temperature 0 — for scoring, where a before/after
   * comparison must not straddle two models' opinions.
   */
  stable?: boolean;
}

/** Enough for a mid-sized JSON reply; individual routes override it. */
const DEFAULT_MAX_TOKENS = 3000;

/** Groq rejects a request whose reserved budget alone breaks the cap. */
const MIN_MAX_TOKENS = 800;

/**
 * Default model pools for the OpenAI-compatible providers. Each free tier
 * meters models separately, so every extra model is another quota.
 *
 * All were checked live on 2026-10-04 against the app's real ATS prompt for
 * speed and for JSON the parser accepts. Groq retired its Llama models, which
 * is why llama-3.3-70b-versatile is gone. Re-list a provider's catalog with:
 *   curl -s <base>/models -H "Authorization: Bearer $KEY" | jq -r '.data[].id'
 */
const DEFAULT_GROQ_MODELS = [
  "openai/gpt-oss-120b", // ~3.5s, 8K TPM
  "qwen/qwen3.8-27b", // ~2.5s
  "openai/gpt-oss-20b", // ~2s
];

/** 40 RPM across the account, no daily cap — slower than Groq (~10s). */
const DEFAULT_NVIDIA_MODELS = ["openai/gpt-oss-20b"];

/**
 * Free but slow (~90s on a full ATS prompt) and the least accurate of the
 * pool, so it only runs once everything else has failed.
 */
const DEFAULT_ZAI_MODELS = ["glm-4.5-flash"];

/** gpt-oss spends long stretches reasoning unless told to keep it short. */
function gptOssReasoning(model: string): Record<string, unknown> {
  return model.includes("gpt-oss") ? { reasoning_effort: "low" } : {};
}

/**
 * GitHub Models retired the Azure inference host — it now answers every request
 * with an empty-bodied 404. The current host is models.github.ai and it expects
 * fully-qualified `publisher/model` ids.
 */
const GITHUB_MODELS_ENDPOINT =
  "https://models.github.ai/inference/chat/completions";

const ALL_PROVIDERS_FAILED_PREFIX = "All AI providers failed";

/**
 * Every provider failed. `message` is safe to show a user; `detail` holds the
 * per-provider breakdown (status codes, upstream bodies with account ids) and
 * belongs in server logs only.
 */
export class AIUnavailableError extends Error {
  readonly detail: string;

  constructor(detail: string) {
    super(
      "The AI service is busy right now. Please try again in a minute.",
    );
    this.name = "AIUnavailableError";
    this.detail = detail;
  }
}

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

/**
 * Models to spread OpenRouter traffic across.
 *
 * OPENROUTER_MODELS overrides the pool; an unset (or all-blank) value falls
 * back to the vetted free tier rather than disabling the provider, so a bare
 * OPENROUTER_API_KEY is enough to bring OpenRouter online.
 */
function readOpenRouterModels(): string[] {
  const configured = readEnv("OPENROUTER_MODELS")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  return configured.length > 0 ? configured : [...DEFAULT_FREE_MODELS];
}

/** The first env var holding a non-empty comma list wins, else the defaults. */
function readModelList(keys: string[], defaults: string[]): string[] {
  for (const key of keys) {
    const models = readEnv(key)
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    if (models.length > 0) return models;
  }
  return [...defaults];
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
    groq: {
      name: "Groq",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: readEnv("GROQ_API_KEY"),
      // GROQ_MODEL is the older single-model setting; still honoured.
      models: readModelList(["GROQ_MODELS", "GROQ_MODEL"], DEFAULT_GROQ_MODELS),
      extraBody: gptOssReasoning,
    },
    nvidia: {
      name: "NVIDIA",
      endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
      apiKey: readEnv("NVIDIA_API_KEY"),
      models: readModelList(["NVIDIA_MODELS"], DEFAULT_NVIDIA_MODELS),
      extraBody: gptOssReasoning,
    },
    zai: {
      name: "Z.ai",
      endpoint: "https://api.z.ai/api/paas/v4/chat/completions",
      apiKey: readEnv("ZAI_API_KEY"),
      models: readModelList(["ZAI_MODELS"], DEFAULT_ZAI_MODELS),
      // GLM reasons by default, spending the token budget before it answers.
      extraBody: () => ({ thinking: { type: "disabled" } }),
    },
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
  return !(error instanceof AIUnavailableError);
}

function describeFailures(failures: ProviderFailure[]): string {
  if (failures.length === 0) {
    return "No server-side AI provider is configured. Set GROQ_API_KEY, NVIDIA_API_KEY, OPENROUTER_API_KEY, GITHUB_TOKEN, GITHUB_TOKENS, or ZAI_API_KEY.";
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

    const compat = (provider: CompatProvider) => ({
      name: provider.name,
      enabled: Boolean(provider.apiKey),
      call: () =>
        callOpenAICompatible(provider, messages, maxTokens, signal, {
          stable: options.stable,
        }),
    });

    // Fastest and most generous free tiers first; the slow, least accurate
    // one last. OpenRouter's free tier is only 50 requests/day per account.
    const providers: {
      name: string;
      enabled: boolean;
      call: () => Promise<string>;
    }[] = [
      compat(config.groq),
      compat(config.nvidia),
      {
        name: "OpenRouter",
        // The key alone is enough — the model pool always has a default.
        enabled: Boolean(config.openRouterApiKey),
        call: () => callOpenRouter(config, messages, maxTokens, signal),
      },
      {
        name: "GitHub Models",
        enabled: config.githubTokens.length > 0,
        call: () => callGitHub(config, messages, maxTokens, signal),
      },
      compat(config.zai),
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

    const detail = describeFailures(failures);
    console.error(`[AI] ${detail}`);
    throw new AIUnavailableError(detail);
  });
}
