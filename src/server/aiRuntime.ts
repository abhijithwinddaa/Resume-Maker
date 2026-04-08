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

interface ServerAIConfig {
  githubTokens: string[];
  githubModel: string;
  groqApiKey: string;
  groqModel: string;
}

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

function getServerAIConfig(): ServerAIConfig {
  return {
    githubTokens: readGithubTokens(),
    githubModel: readEnv("GITHUB_MODEL") || "gpt-4o-mini",
    groqApiKey: readEnv("GROQ_API_KEY"),
    groqModel: readEnv("GROQ_MODEL") || "llama-3.3-70b-versatile",
  };
}

async function callGitHub(
  config: ServerAIConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  if (config.githubTokens.length === 0) {
    throw new Error("GitHub token is not configured on the server.");
  }

  for (let attempt = 0; attempt < config.githubTokens.length; attempt++) {
    const idx = (currentTokenIndex + attempt) % config.githubTokens.length;
    const token = config.githubTokens[idx];
    const response = await fetch(
      "https://models.inference.ai.azure.com/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.githubModel,
          messages,
          temperature: 0.3,
          max_tokens: 16000,
        }),
        signal,
      },
    );

    if (response.ok) {
      currentTokenIndex = idx;
      const data = (await response.json()) as ChatAPIResponse;
      return data.choices[0]?.message?.content || "";
    }

    if (response.status === 401 || response.status === 429) {
      continue;
    }

    const errBody = await response.text();
    throw new Error(`GitHub Models API error (${response.status}): ${errBody}`);
  }

  throw new Error("ALL_GITHUB_RATE_LIMITED");
}

async function callGroq(
  config: ServerAIConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  if (!config.groqApiKey) {
    throw new Error("Groq API key is not configured on the server.");
  }

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
        max_tokens: 16000,
      }),
      signal,
    },
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errBody}`);
  }

  const data = (await response.json()) as GroqResponse;
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("Groq returned no content.");
  }
  return text;
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
      if (attempt === maxRetries) {
        throw lastError;
      }

      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error("Unknown AI runtime failure.");
}

export async function callServerAI(
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const config = getServerAIConfig();

  return withRetry(async () => {
    signal?.throwIfAborted();

    try {
      return await callGitHub(config, messages, signal);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (
        message !== "ALL_GITHUB_RATE_LIMITED" &&
        !message.includes("not configured")
      ) {
        throw error;
      }
    }

    if (config.groqApiKey) {
      return callGroq(config, messages, signal);
    }

    throw new Error(
      "No server-side AI provider is configured. Set GITHUB_TOKEN, GITHUB_TOKENS, or GROQ_API_KEY.",
    );
  });
}
