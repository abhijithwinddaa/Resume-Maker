export type AIProvider = "groq" | "github";

export interface AISettings {
  provider: AIProvider;
  groqApiKey: string;
  groqModel: string;
  githubToken: string;
  githubTokens: string[];
  githubModel: string;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: "github",
  groqApiKey: "",
  groqModel: "llama-3.3-70b-versatile",
  githubToken: "",
  githubTokens: [],
  githubModel: "gpt-4o-mini",
};

function normalizeProvider(value: unknown): AIProvider {
  return value === "groq" ? "groq" : "github";
}

function sanitizeLoadedSettings(raw: unknown): AISettings {
  const parsed =
    raw && typeof raw === "object"
      ? (raw as Partial<Record<keyof AISettings | "provider", unknown>>)
      : {};

  return {
    provider: normalizeProvider(parsed.provider),
    groqApiKey: typeof parsed.groqApiKey === "string" ? parsed.groqApiKey : "",
    groqModel:
      typeof parsed.groqModel === "string" && parsed.groqModel.trim()
        ? parsed.groqModel
        : DEFAULT_AI_SETTINGS.groqModel,
    githubToken:
      typeof parsed.githubToken === "string" ? parsed.githubToken : "",
    githubTokens: Array.isArray(parsed.githubTokens)
      ? parsed.githubTokens.filter(
          (token): token is string =>
            typeof token === "string" && token.trim().length > 0,
        )
      : [],
    githubModel:
      typeof parsed.githubModel === "string" && parsed.githubModel.trim()
        ? parsed.githubModel
        : DEFAULT_AI_SETTINGS.githubModel,
  };
}

function withoutClientSecrets(settings: AISettings): AISettings {
  return {
    ...settings,
    groqApiKey: "",
    githubToken: "",
    githubTokens: [],
  };
}

export const GROQ_MODELS = [
  { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B (Best quality)" },
  { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B (Fastest)" },
  { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B (Good balance)" },
  { id: "gemma2-9b-it", name: "Gemma 2 9B" },
];

export const GITHUB_MODELS = [
  { id: "gpt-4o-mini", name: "GPT-4o Mini (Best balance)" },
  { id: "gpt-4o", name: "GPT-4o (Most capable)" },
  { id: "Meta-Llama-3.1-405B-Instruct", name: "Llama 3.1 405B" },
  { id: "Meta-Llama-3.1-70B-Instruct", name: "Llama 3.1 70B" },
  { id: "Meta-Llama-3.1-8B-Instruct", name: "Llama 3.1 8B (Fastest)" },
  { id: "Mistral-Large-2411", name: "Mistral Large" },
];

export function loadAISettings(): AISettings {
  try {
    const saved = localStorage.getItem("ai-settings");
    if (saved) {
      return withoutClientSecrets(sanitizeLoadedSettings(JSON.parse(saved)));
    }
  } catch {
    // ignore
  }
  return withoutClientSecrets(DEFAULT_AI_SETTINGS);
}

export function saveAISettings(settings: AISettings): void {
  localStorage.setItem(
    "ai-settings",
    JSON.stringify(withoutClientSecrets(settings)),
  );
}
