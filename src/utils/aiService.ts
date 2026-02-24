import type { AISettings } from "../types/aiSettings";
import type { ResumeData } from "../types/resume";
import { buildResumePrompt } from "./aiPrompt";
import { buildATSPrompt } from "./atsPrompt";
import { buildOptimizePrompt } from "./optimizePrompt";
import { buildResumeParsePrompt } from "./resumeParser";
import { getCacheKey, getCached, setCache } from "./aiCache";

export interface ATSBreakdownItem {
  score: number;
  weight: number;
  feedback: string;
  matchedKeywords?: string[];
  missingKeywords?: string[];
  matchedSkills?: string[];
  missingSkills?: string[];
}

export interface ATSResult {
  overallScore: number;
  breakdown: {
    keywordMatch: ATSBreakdownItem;
    skillsAlignment: ATSBreakdownItem;
    experienceRelevance: ATSBreakdownItem;
    formatting: ATSBreakdownItem;
    impact: ATSBreakdownItem;
  };
  topSuggestions: string[];
  summaryVerdict: string;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatAPIResponse {
  choices: { message: { content: string } }[];
}

function extractJSON(text: string): string {
  // Try to extract JSON from response (handles markdown code fences, extra text, etc.)
  // First try: direct parse
  // First: trim whitespace
  const trimmed = text.trim();

  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // ignore
  }

  // Try: extract from code fences
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try: find first { and last } — validate it parses
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const extracted = trimmed.substring(firstBrace, lastBrace + 1);
    try {
      JSON.parse(extracted);
      return extracted;
    } catch {
      // JSON might be truncated — try to repair by closing open structures
      const repaired = repairTruncatedJSON(extracted);
      try {
        JSON.parse(repaired);
        return repaired;
      } catch {
        return extracted;
      }
    }
  }

  return trimmed;
}

function repairTruncatedJSON(json: string): string {
  // Count unclosed brackets/braces and try to close them
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escaped = false;

  for (const ch of json) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") openBraces++;
    if (ch === "}") openBraces--;
    if (ch === "[") openBrackets++;
    if (ch === "]") openBrackets--;
  }

  // If we were in a string, close it
  let repaired = json;
  if (inString) repaired += '"';

  // Close any open brackets/braces
  for (let i = 0; i < openBrackets; i++) repaired += "]";
  for (let i = 0; i < openBraces; i++) repaired += "}";

  return repaired;
}

// Track which token index to start with (rotates on rate limit)
let currentTokenIndex = 0;

async function callGitHub(
  settings: AISettings,
  messages: ChatMessage[],
): Promise<string> {
  const tokens =
    settings.githubTokens && settings.githubTokens.length > 0
      ? settings.githubTokens
      : settings.githubToken
        ? [settings.githubToken]
        : [];

  if (tokens.length === 0) {
    throw new Error(
      "GitHub token is not set. Go to Settings to add your token.",
    );
  }

  // Try each token starting from the current index
  for (let attempt = 0; attempt < tokens.length; attempt++) {
    const idx = (currentTokenIndex + attempt) % tokens.length;
    const token = tokens[idx];

    const response = await fetch(
      "https://models.inference.ai.azure.com/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: settings.githubModel,
          messages,
          temperature: 0.3,
          max_tokens: 16000,
        }),
      },
    );

    if (response.ok) {
      // Remember this working token for next call
      currentTokenIndex = idx;
      const data = (await response.json()) as ChatAPIResponse;
      return data.choices[0].message.content;
    }

    if (response.status === 429) {
      console.warn(
        `Token ${idx + 1}/${tokens.length} rate limited, trying next...`,
      );
      // Try next token
      continue;
    }

    if (response.status === 401) {
      console.warn(`Token ${idx + 1}/${tokens.length} invalid, trying next...`);
      continue;
    }

    // Other errors — don't retry
    const errBody = await response.text();
    throw new Error(`GitHub Models API error (${response.status}): ${errBody}`);
  }

  // All GitHub tokens exhausted
  currentTokenIndex = (currentTokenIndex + 1) % tokens.length;
  throw new Error("ALL_GITHUB_RATE_LIMITED");
}

/* ── Google Gemini fallback ──────────────────────────── */

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
}

async function callGemini(
  settings: AISettings,
  messages: ChatMessage[],
): Promise<string> {
  if (!settings.geminiApiKey) {
    throw new Error("Gemini API key is not set.");
  }

  // Convert ChatMessage format to Gemini format
  const systemMsg = messages.find((m) => m.role === "system");
  const userMsgs = messages.filter((m) => m.role !== "system");

  const contents = userMsgs.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  // Prepend system instruction as first user message if present
  if (systemMsg) {
    contents.unshift({
      role: "user",
      parts: [{ text: `[System Instructions]\n${systemMsg.content}` }],
    });
    contents.splice(1, 0, {
      role: "model",
      parts: [{ text: "Understood. I will follow these instructions." }],
    });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${settings.geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 16000,
        },
      }),
    },
  );

  if (!response.ok) {
    const errBody = await response.text();
    if (response.status === 429) {
      throw new Error("Gemini rate limit exceeded. Please wait and try again.");
    }
    throw new Error(`Gemini API error (${response.status}): ${errBody}`);
  }

  const data = (await response.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned no content.");
  }
  return text;
}

/* ── Exponential Backoff Retry ────────────────────────── */

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on non-retryable errors
      const msg = lastError.message;
      if (
        msg === "ALL_GITHUB_RATE_LIMITED" ||
        msg.includes("invalid JSON") ||
        msg.includes("missing required") ||
        msg.includes("not set") ||
        attempt === maxRetries
      ) {
        throw lastError;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(
        `Attempt ${attempt + 1} failed, retrying in ${delay}ms...`,
        msg,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/* ── Unified AI caller with fallback chain ───────────── */

export async function callAI(
  settings: AISettings,
  messages: ChatMessage[],
): Promise<string> {
  return withRetry(async () => {
    try {
      return await callGitHub(settings, messages);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // If all GitHub tokens are rate limited, fall back to Gemini
      if (msg === "ALL_GITHUB_RATE_LIMITED" && settings.geminiApiKey) {
        console.warn("All GitHub tokens rate limited — falling back to Gemini");
        return callGemini(settings, messages);
      }
      throw err;
    }
  });
}

/* ── Streaming AI caller (SSE) for progressive UI ────── */

interface StreamDelta {
  choices?: { delta?: { content?: string } }[];
}

export async function callAIStreaming(
  settings: AISettings,
  messages: ChatMessage[],
  onChunk: (partialText: string) => void,
): Promise<string> {
  const tokens =
    settings.githubTokens && settings.githubTokens.length > 0
      ? settings.githubTokens
      : settings.githubToken
        ? [settings.githubToken]
        : [];

  if (tokens.length === 0) {
    // Fall back to non-streaming
    const result = await callAI(settings, messages);
    onChunk(result);
    return result;
  }

  const token = tokens[currentTokenIndex % tokens.length];

  const response = await fetch(
    "https://models.inference.ai.azure.com/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings.githubModel,
        messages,
        temperature: 0.3,
        max_tokens: 16000,
        stream: true,
      }),
    },
  );

  if (!response.ok) {
    // Fall back to non-streaming on error
    const result = await callAI(settings, messages);
    onChunk(result);
    return result;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const result = await callAI(settings, messages);
    onChunk(result);
    return result;
  }

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") break;

      try {
        const parsed = JSON.parse(data) as StreamDelta;
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          fullText += content;
          onChunk(fullText);
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  return fullText;
}

export async function generateAIResume(
  settings: AISettings,
  resumeData: ResumeData,
  jobDescription: string,
): Promise<ResumeData> {
  const prompt = buildResumePrompt(resumeData, jobDescription);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are an expert resume writer. You output ONLY valid JSON. No markdown, no explanation, no code fences.",
    },
    {
      role: "user",
      content: prompt,
    },
  ];

  let rawResponse: string;
  rawResponse = await callAI(settings, messages);

  const jsonStr = extractJSON(rawResponse);

  let parsed: ResumeData;
  try {
    parsed = JSON.parse(jsonStr) as ResumeData;
  } catch {
    throw new Error(
      `AI returned invalid JSON. Try again or switch to a more capable model.\n\nRaw response preview: ${rawResponse.substring(0, 300)}...`,
    );
  }

  // Validate basic structure
  if (
    !parsed.contact ||
    !parsed.summary ||
    !parsed.projects ||
    !parsed.skills
  ) {
    throw new Error(
      "AI response is missing required fields (contact, summary, projects, or skills). Try again.",
    );
  }

  // Preserve contact info from original (AI shouldn't change it)
  parsed.contact = resumeData.contact;
  // Preserve education
  parsed.education = resumeData.education;
  // Preserve certificates
  parsed.certificates = resumeData.certificates;
  parsed.showCertificates = resumeData.showCertificates;
  // Preserve section order
  parsed.sectionOrder = resumeData.sectionOrder;
  // Preserve experience immutables
  if (!parsed.experience) parsed.experience = resumeData.experience;
  parsed.showExperience = resumeData.showExperience;

  return parsed;
}

export async function analyzeATSScore(
  settings: AISettings,
  resumeData: ResumeData,
  jobDescription: string,
): Promise<ATSResult> {
  // Check cache first
  const cacheKey = getCacheKey(
    "ats",
    JSON.stringify(resumeData),
    jobDescription,
  );
  const cached = getCached<ATSResult>(cacheKey);
  if (cached) {
    console.log("ATS score loaded from cache");
    return cached;
  }

  const prompt = buildATSPrompt(resumeData, jobDescription);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are an expert ATS analyzer. You output ONLY valid JSON. No markdown, no explanation, no code fences.",
    },
    {
      role: "user",
      content: prompt,
    },
  ];

  let rawResponse: string;
  rawResponse = await callAI(settings, messages);

  const jsonStr = extractJSON(rawResponse);

  let parsed: ATSResult;
  try {
    parsed = JSON.parse(jsonStr) as ATSResult;
  } catch {
    throw new Error(
      `AI returned invalid JSON for ATS analysis. Try again.\n\nRaw response preview: ${rawResponse.substring(0, 300)}...`,
    );
  }

  if (
    typeof parsed.overallScore !== "number" ||
    !parsed.breakdown ||
    !parsed.topSuggestions
  ) {
    throw new Error("AI response is missing required ATS fields. Try again.");
  }

  // Clamp score to 0-100
  parsed.overallScore = Math.max(
    0,
    Math.min(100, Math.round(parsed.overallScore)),
  );

  // Cache the result
  setCache(cacheKey, parsed);

  return parsed;
}

// ─── Auto-Optimize Loop ─────────────────────────────────

export interface OptimizeIteration {
  iteration: number;
  atsResult: ATSResult;
  resumeData: ResumeData;
  phase: "scanning" | "rewriting" | "done";
}

export interface OptimizeProgress {
  currentIteration: number;
  maxIterations: number;
  phase: "scanning" | "rewriting" | "done" | "target-reached" | "error";
  message: string;
  history: OptimizeIteration[];
  finalResume: ResumeData | null;
  finalScore: number;
  error?: string;
}

export async function optimizeResumeLoop(
  settings: AISettings,
  resumeData: ResumeData,
  jobDescription: string,
  targetScore: number,
  maxIterations: number,
  onProgress: (progress: OptimizeProgress) => void,
  abortSignal?: AbortSignal,
): Promise<OptimizeProgress> {
  const history: OptimizeIteration[] = [];
  let currentResume = { ...resumeData };
  let bestScore = 0;
  let bestResume = currentResume;

  for (let i = 1; i <= maxIterations; i++) {
    // Check abort
    if (abortSignal?.aborted) {
      const progress: OptimizeProgress = {
        currentIteration: i,
        maxIterations,
        phase: "error",
        message: "Optimization cancelled by user.",
        history,
        finalResume: bestResume,
        finalScore: bestScore,
        error: "Cancelled",
      };
      onProgress(progress);
      return progress;
    }

    // Phase 1: ATS Scan
    onProgress({
      currentIteration: i,
      maxIterations,
      phase: "scanning",
      message: `Iteration ${i}/${maxIterations}: Scanning resume with ATS...`,
      history,
      finalResume: null,
      finalScore: bestScore,
    });

    let atsResult: ATSResult;
    try {
      atsResult = await analyzeATSScore(
        settings,
        currentResume,
        jobDescription,
      );
    } catch (err) {
      const progress: OptimizeProgress = {
        currentIteration: i,
        maxIterations,
        phase: "error",
        message: `ATS scan failed on iteration ${i}.`,
        history,
        finalResume: bestResume,
        finalScore: bestScore,
        error: err instanceof Error ? err.message : "ATS scan failed",
      };
      onProgress(progress);
      return progress;
    }

    // Track best
    if (atsResult.overallScore > bestScore) {
      bestScore = atsResult.overallScore;
      bestResume = currentResume;
    }

    history.push({
      iteration: i,
      atsResult,
      resumeData: currentResume,
      phase: "done",
    });

    // Check if target reached
    if (atsResult.overallScore >= targetScore) {
      const progress: OptimizeProgress = {
        currentIteration: i,
        maxIterations,
        phase: "target-reached",
        message: `Target reached! Score: ${atsResult.overallScore}/100 after ${i} iteration(s).`,
        history,
        finalResume: currentResume,
        finalScore: atsResult.overallScore,
      };
      onProgress(progress);
      return progress;
    }

    // Phase 2: AI Rewrite using ATS feedback
    if (abortSignal?.aborted) break;

    onProgress({
      currentIteration: i,
      maxIterations,
      phase: "rewriting",
      message: `Iteration ${i}/${maxIterations}: Score ${atsResult.overallScore}/100 — AI is rewriting to fix gaps...`,
      history,
      finalResume: null,
      finalScore: bestScore,
    });

    const optimizePrompt = buildOptimizePrompt(
      currentResume,
      jobDescription,
      atsResult,
      i,
    );

    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are an expert resume optimizer. You output ONLY valid JSON. No markdown, no explanation, no code fences. You must incorporate ALL missing keywords and skills from the ATS report.",
      },
      { role: "user", content: optimizePrompt },
    ];

    let rawResponse: string;
    try {
      rawResponse = await callAI(settings, messages);
    } catch (err) {
      const progress: OptimizeProgress = {
        currentIteration: i,
        maxIterations,
        phase: "error",
        message: `AI rewrite failed on iteration ${i}.`,
        history,
        finalResume: bestResume,
        finalScore: bestScore,
        error: err instanceof Error ? err.message : "AI rewrite failed",
      };
      onProgress(progress);
      return progress;
    }

    const jsonStr = extractJSON(rawResponse);

    let parsed: ResumeData;
    try {
      parsed = JSON.parse(jsonStr) as ResumeData;
    } catch {
      // If parse fails, skip this iteration and use previous best
      continue;
    }

    // Preserve immutable fields
    parsed.contact = resumeData.contact;
    parsed.education = resumeData.education;
    parsed.certificates = resumeData.certificates;
    parsed.showCertificates = resumeData.showCertificates;
    parsed.sectionOrder = resumeData.sectionOrder;
    if (!parsed.experience) parsed.experience = resumeData.experience;
    parsed.showExperience = resumeData.showExperience;

    currentResume = parsed;
  }

  // Exhausted all iterations — return best result
  const progress: OptimizeProgress = {
    currentIteration: maxIterations,
    maxIterations,
    phase: "done",
    message: `Completed ${maxIterations} iterations. Best score: ${bestScore}/100.`,
    history,
    finalResume: bestResume,
    finalScore: bestScore,
  };
  onProgress(progress);
  return progress;
}

// ─── Resume Parser ───────────────────────────────────────

export async function parseResumeFromText(
  settings: AISettings,
  resumeText: string,
): Promise<ResumeData> {
  // Check cache first
  const cacheKey = getCacheKey("parse", resumeText);
  const cached = getCached<ResumeData>(cacheKey);
  if (cached) {
    console.log("Parsed resume loaded from cache");
    return cached;
  }

  const prompt = buildResumeParsePrompt(resumeText);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are an expert resume parser. Output ONLY valid JSON. No markdown, no explanation, no code fences.",
    },
    { role: "user", content: prompt },
  ];

  const rawResponse = await callAI(settings, messages);
  const jsonStr = extractJSON(rawResponse);

  let parsed: ResumeData;
  try {
    parsed = JSON.parse(jsonStr) as ResumeData;
  } catch {
    throw new Error(
      `AI returned invalid JSON when parsing resume. Try again.\n\nRaw preview: ${rawResponse.substring(0, 300)}...`,
    );
  }

  if (!parsed.contact?.name) {
    throw new Error("Could not parse resume: missing contact name");
  }

  // Set defaults for optional fields
  if (!parsed.certificates) parsed.certificates = [];
  if (parsed.showCertificates === undefined) {
    parsed.showCertificates = parsed.certificates.length > 0;
  }
  if (!parsed.achievements) parsed.achievements = [];
  if (!parsed.education) parsed.education = [];
  if (!parsed.projects) parsed.projects = [];
  if (!parsed.skills) parsed.skills = [];
  if (!parsed.summary) parsed.summary = "";
  if (!parsed.experience) parsed.experience = [];
  if (parsed.showExperience === undefined) {
    parsed.showExperience = parsed.experience.length > 0;
  }
  if (!parsed.sectionOrder) {
    const { DEFAULT_SECTION_ORDER } = await import("../types/resume");
    parsed.sectionOrder = DEFAULT_SECTION_ORDER;
  }

  // Cache the result
  setCache(cacheKey, parsed);

  return parsed;
}
