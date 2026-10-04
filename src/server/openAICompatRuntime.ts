/**
 * Client for providers that speak the OpenAI chat-completions protocol
 * (Groq, NVIDIA NIM, Z.ai), with a pool of models per provider.
 *
 * Free tiers meter each model separately, so one key is worth a quota per
 * model. Calls rotate their starting model to spread load across the pool,
 * and a model that answers 429 sits out a cooldown instead of being hit again
 * on every request. The cooldown lives in module state: it survives between
 * invocations on a warm serverless instance and resets on a cold one, which is
 * fine — the worst case is one extra 429 per instance.
 */

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CompatResponse {
  choices?: { message?: { content?: string | null } }[];
}

export interface CompatProvider {
  /** Shown in logs and in the aggregated failure message. */
  name: string;
  /** Full chat-completions URL. */
  endpoint: string;
  apiKey: string;
  models: string[];
  /** Provider- or model-specific request fields, e.g. reasoning controls. */
  extraBody?: (model: string) => Record<string, unknown>;
}

/** Groq rejects a request whose reserved budget alone breaks the cap. */
const MIN_MAX_TOKENS = 800;

/** How many times one call may halve its budget after a 413. */
const MAX_BUDGET_SHRINKS = 2;

/** Cooldown for a 429 that carries no usable Retry-After header. */
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60_000;

/** Never bench a model longer than this on a provider's say-so. */
const MAX_RATE_LIMIT_COOLDOWN_MS = 60 * 60_000;

/** A 404 for a model id usually means it was retired from the catalog. */
const MISSING_MODEL_COOLDOWN_MS = 15 * 60_000;

const cooldownUntil = new Map<string, number>();
const nextStartIndex = new Map<string, number>();

/** Test hook: forget every cooldown and rotation position. */
export function resetModelCooldowns(): void {
  cooldownUntil.clear();
  nextStartIndex.clear();
}

function cooldownKey(provider: CompatProvider, model: string): string {
  return `${provider.name}:${model}`;
}

function isCoolingDown(provider: CompatProvider, model: string): boolean {
  const until = cooldownUntil.get(cooldownKey(provider, model));
  return until !== undefined && until > Date.now();
}

function coolDown(provider: CompatProvider, model: string, ms: number): void {
  cooldownUntil.set(cooldownKey(provider, model), Date.now() + ms);
}

function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get("retry-after"));
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return DEFAULT_RATE_LIMIT_COOLDOWN_MS;
  }
  return Math.min(seconds * 1000, MAX_RATE_LIMIT_COOLDOWN_MS);
}

export interface CompatCallOptions {
  /**
   * Always start on the pool's first model, at temperature 0. Different
   * models score the same resume 20+ points apart, so a before/after
   * comparison is only meaningful when both come from one model.
   */
  stable?: boolean;
}

/**
 * The pool in the order this call should try it: rotated so successive calls
 * start on different models (unless the call is stable), with cooling-down
 * models left out.
 */
function attemptOrder(provider: CompatProvider, stable: boolean): string[] {
  const { models } = provider;
  if (stable) return models.filter((model) => !isCoolingDown(provider, model));

  const start = nextStartIndex.get(provider.name) ?? 0;
  nextStartIndex.set(provider.name, (start + 1) % models.length);

  const rotated = [...models.slice(start), ...models.slice(0, start)];
  return rotated.filter((model) => !isCoolingDown(provider, model));
}

/** Some models fence their reasoning in <think> tags inside `content`. */
export function stripThinkingTokens(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export async function callOpenAICompatible(
  provider: CompatProvider,
  messages: ChatMessage[],
  maxTokens: number,
  signal?: AbortSignal,
  options: CompatCallOptions = {},
): Promise<string> {
  const stable = options.stable ?? false;
  if (!provider.apiKey) {
    throw new Error(`${provider.name} API key is not configured.`);
  }
  if (provider.models.length === 0) {
    throw new Error(`No ${provider.name} models configured.`);
  }

  const models = attemptOrder(provider, stable);
  if (models.length === 0) {
    throw new Error("every model is cooling down after a rate limit");
  }

  let budget = maxTokens;
  let shrinks = 0;
  let lastFailure = "no models attempted";

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    signal?.throwIfAborted();

    const response = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: stable ? 0 : 0.3,
        max_tokens: budget,
        ...provider.extraBody?.(model),
      }),
      signal,
    });

    if (response.ok) {
      const data = (await response.json()) as CompatResponse;
      const content = stripThinkingTokens(
        data.choices?.[0]?.message?.content ?? "",
      );
      if (content) return content;

      lastFailure = `${model} returned an empty response`;
      continue;
    }

    const errBody = (await response.text()).slice(0, 300);
    lastFailure = `${model} HTTP ${response.status}${errBody ? `: ${errBody}` : ""}`;
    console.warn(`[${provider.name}] ${lastFailure}`);

    // A rejected key is rejected for every model — stop spending calls on it.
    if (response.status === 401 || response.status === 403) {
      throw new Error(`key rejected (${lastFailure})`);
    }

    if (response.status === 429) {
      coolDown(provider, model, retryAfterMs(response));
      continue;
    }

    if (response.status === 404) {
      coolDown(provider, model, MISSING_MODEL_COOLDOWN_MS);
      continue;
    }

    // 413 means input + reserved budget broke the per-minute token cap.
    // Retrying unchanged can only fail again, so trade completion headroom
    // for a reply that fits — on the same model, while shrinking still helps.
    if (
      response.status === 413 &&
      budget > MIN_MAX_TOKENS &&
      shrinks < MAX_BUDGET_SHRINKS
    ) {
      budget = Math.max(MIN_MAX_TOKENS, Math.floor(budget / 2));
      shrinks++;
      console.warn(
        `[${provider.name}] request too large — retrying ${model} with max_tokens=${budget}`,
      );
      i--;
      continue;
    }
  }

  throw new Error(`all models failed (${lastFailure})`);
}
