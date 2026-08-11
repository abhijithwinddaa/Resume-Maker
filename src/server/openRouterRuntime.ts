/**
 * OpenRouter API client with weighted-random load balancing across free models.
 *
 * Designed for serverless (Vercel Functions) — no persistent module state.
 * Each invocation independently picks a model via weighted random selection,
 * retrying across remaining models on 429 / 401 / 402 errors.
 */

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenRouterChoice {
  message: { content: string };
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  error?: {
    message?: string;
    code?: number | string;
    metadata?: Record<string, unknown>;
  };
}

export interface OpenRouterConfig {
  openRouterApiKey: string;
  openRouterModels: string[];
}

const OPENROUTER_ENDPOINT =
  "https://openrouter.ai/api/v1/chat/completions";

const APP_REFERER = "https://resume.batturaj.in";
const APP_TITLE = "Resume Maker";

/** Default model weights — higher weight = higher selection probability. */
const DEFAULT_MODEL_WEIGHTS: Record<string, number> = {
  "openai/gpt-oss-120b:free": 4,
  "google/gemini-2.5-flash-preview-05-20:free": 3,
  "qwen/qwq-32b:free": 2,
  "meta-llama/llama-4-maverick:free": 1,
};

/**
 * Pick a model using weighted random selection from the available pool.
 * Models with higher weights get proportionally more traffic.
 */
function pickWeightedRandom(models: string[]): string {
  if (models.length === 1) return models[0];

  const weights = models.map(
    (model) => DEFAULT_MODEL_WEIGHTS[model] ?? 1,
  );
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < models.length; i++) {
    random -= weights[i];
    if (random <= 0) return models[i];
  }

  // Fallback (should not reach here)
  return models[models.length - 1];
}

/**
 * Strip reasoning/thinking tokens that some models (e.g. QwQ) may emit
 * before the actual JSON content. Looks for patterns like <think>...</think>.
 */
function stripThinkingTokens(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
}

/**
 * Call OpenRouter with weighted-random model selection and per-request retry.
 *
 * Strategy:
 * 1. Shuffle models via weighted random (no persistent state needed)
 * 2. Try the selected model
 * 3. On 429 (rate limit) → try next model
 * 4. On 401/402 (auth/payment) → try next model
 * 5. On success → return content
 * 6. If all models exhausted → throw ALL_OPENROUTER_RATE_LIMITED
 */
export async function callOpenRouter(
  config: OpenRouterConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const { openRouterApiKey, openRouterModels } = config;

  if (!openRouterApiKey) {
    throw new Error("OpenRouter API key is not configured.");
  }

  if (openRouterModels.length === 0) {
    throw new Error("No OpenRouter models configured.");
  }

  // Build a shuffled attempt order using weighted random (without replacement)
  const remaining = [...openRouterModels];
  const attemptOrder: string[] = [];
  while (remaining.length > 0) {
    const picked = pickWeightedRandom(remaining);
    attemptOrder.push(picked);
    remaining.splice(remaining.indexOf(picked), 1);
  }

  for (const model of attemptOrder) {
    signal?.throwIfAborted();

    let response: Response;
    try {
      response = await fetch(OPENROUTER_ENDPOINT, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openRouterApiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": APP_REFERER,
          "X-Title": APP_TITLE,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
          max_tokens: 16000,
        }),
        signal,
      });
    } catch (err) {
      // The caller giving up is not a model fault — don't burn the remaining models on it.
      if (err instanceof Error && err.name === "AbortError") {
        throw err;
      }
      // Network error — try next model
      console.warn(
        `[OpenRouter] Network error for ${model}:`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }

    // Handle rate limit — try next model
    if (response.status === 429) {
      console.warn(`[OpenRouter] ${model} rate limited (429), trying next model`);
      continue;
    }

    // Handle auth/payment errors — try next model
    if (response.status === 401 || response.status === 402 || response.status === 403) {
      console.warn(
        `[OpenRouter] ${model} auth/payment error (${response.status}), trying next model`,
      );
      continue;
    }

    // Parse the response
    let data: OpenRouterResponse;
    try {
      data = (await response.json()) as OpenRouterResponse;
    } catch {
      console.warn(`[OpenRouter] ${model} returned non-JSON response, trying next model`);
      continue;
    }

    // Handle OpenRouter error envelope
    if (data.error) {
      const errorCode = data.error.code;
      const errorMessage = data.error.message || "Unknown OpenRouter error";

      // Rate limit or model-specific errors — retry with next model
      if (
        errorCode === 429 ||
        errorCode === "rate_limit_exceeded" ||
        errorCode === 402 ||
        errorCode === 401
      ) {
        console.warn(
          `[OpenRouter] ${model} error: ${errorMessage} (code: ${errorCode}), trying next`,
        );
        continue;
      }

      // Other errors — still try next model rather than failing immediately
      console.warn(`[OpenRouter] ${model} error: ${errorMessage}`);
      continue;
    }

    // Handle non-OK status that wasn't caught above
    if (!response.ok) {
      console.warn(
        `[OpenRouter] ${model} unexpected status ${response.status}, trying next model`,
      );
      continue;
    }

    // Extract content from successful response
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.warn(`[OpenRouter] ${model} returned empty content, trying next model`);
      continue;
    }

    // Strip any thinking tokens and return clean content
    const cleaned = stripThinkingTokens(content);
    if (!cleaned) {
      console.warn(`[OpenRouter] ${model} returned only thinking tokens, trying next model`);
      continue;
    }

    console.log(`[OpenRouter] Success with model: ${model}`);
    return cleaned;
  }

  // All models exhausted
  throw new Error("ALL_OPENROUTER_RATE_LIMITED");
}
