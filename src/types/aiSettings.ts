export type AIProvider = "groq" | "ollama" | "github";

export interface AISettings {
  provider: AIProvider;
  groqApiKey: string;
  groqModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  githubToken: string;
  githubTokens: string[];
  githubModel: string;
  geminiApiKey: string;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: "github",
  groqApiKey: "",
  groqModel: "llama-3.3-70b-versatile",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "gemma3:4b",
  githubToken: "",
  githubTokens: [],
  githubModel: "gpt-4o-mini",
  geminiApiKey: "",
};

function withoutClientSecrets(settings: AISettings): AISettings {
  return {
    ...settings,
    groqApiKey: "",
    githubToken: "",
    githubTokens: [],
    geminiApiKey: "",
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
      return withoutClientSecrets({
        ...DEFAULT_AI_SETTINGS,
        ...JSON.parse(saved),
      });
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
