import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_AI_SETTINGS,
  loadAISettings,
  saveAISettings,
  type AISettings,
} from "../types/aiSettings";

describe("aiSettings migration and sanitization", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("coerces unsupported legacy providers to github", () => {
    localStorage.setItem(
      "ai-settings",
      JSON.stringify({
        provider: "legacy-provider",
        githubModel: "gpt-4o",
        groqModel: "llama-3.1-8b-instant",
        removedApiKey: "legacy-key",
      }),
    );

    const settings = loadAISettings();

    expect(settings.provider).toBe("github");
    expect(settings.githubModel).toBe("gpt-4o");
    expect(settings.groqModel).toBe("llama-3.1-8b-instant");
    expect("removedApiKey" in settings).toBe(false);
  });

  it("preserves supported provider and falls back invalid model values", () => {
    localStorage.setItem(
      "ai-settings",
      JSON.stringify({
        provider: "groq",
        githubModel: "",
        groqModel: "",
        githubTokens: ["", "token-a", 42, " token-b "],
      }),
    );

    const settings = loadAISettings();

    expect(settings.provider).toBe("groq");
    expect(settings.githubModel).toBe(DEFAULT_AI_SETTINGS.githubModel);
    expect(settings.groqModel).toBe(DEFAULT_AI_SETTINGS.groqModel);
    expect(settings.githubTokens).toEqual([]);
  });

  it("never persists client-side secrets", () => {
    const settings: AISettings = {
      ...DEFAULT_AI_SETTINGS,
      provider: "groq",
      groqApiKey: "secret-groq",
      githubToken: "secret-github",
      githubTokens: ["t1", "t2"],
    };

    saveAISettings(settings);

    const raw = JSON.parse(localStorage.getItem("ai-settings") || "{}");
    expect(raw.provider).toBe("groq");
    expect(raw.groqApiKey).toBe("");
    expect(raw.githubToken).toBe("");
    expect(raw.githubTokens).toEqual([]);
  });
});
