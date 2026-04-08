import type { AISettings } from "../types/aiSettings";
import type { ResumeData } from "../types/resume";
import { buildResumePrompt } from "./aiPrompt";
import { getCacheKey, getCached, setCache } from "./aiCache";
import { loadPrivacySettings } from "../types/privacySettings";
import {
  analyzeResumeFeedback,
  type ResumeFeedbackInsights,
} from "./resumeFeedback";
import type {
  AnalyzeATSRequest,
  AnalyzeATSResponse,
  ParseResumeRequest,
  ParseResumeResponse,
  RewriteResumeRequest,
  RewriteResumeResponse,
} from "../types/serverAI";

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
  qualityInsights?: ResumeFeedbackInsights;
}

function normalizeKeywordValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeKeywordValue(value: string): string {
  return normalizeKeywordValue(value)
    .replace(/\bnode\s+js\b/g, "nodejs")
    .replace(/\breact\s+js\b/g, "reactjs")
    .replace(/\bnext\s+js\b/g, "nextjs")
    .replace(/\bexpress\s+js\b/g, "expressjs")
    .replace(/\bnest\s+js\b/g, "nestjs")
    .replace(/\bvue\s+js\b/g, "vuejs")
    .replace(/\bweb\s+sockets?\b/g, "websocket")
    .replace(/\bwebsockets\b/g, "websocket")
    .replace(/\brest\s+apis?\b/g, "rest api")
    .replace(/\bapis\b/g, "api")
    .replace(/\bllms\b/g, "llm")
    .replace(/\s+/g, " ")
    .trim();
}

function compactKeywordValue(value: string): string {
  return canonicalizeKeywordValue(value).replace(/\s+/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildResumeSearchIndex(resumeData: ResumeData): {
  normalized: string;
  compact: string;
} {
  const serialized = JSON.stringify(resumeData);
  const normalized = ` ${canonicalizeKeywordValue(serialized)} `;
  return {
    normalized,
    compact: normalized.replace(/\s+/g, ""),
  };
}

function resumeContainsKeyword(
  searchIndex: { normalized: string; compact: string },
  value: string,
): boolean {
  const normalizedValue = canonicalizeKeywordValue(value);
  if (!normalizedValue) return false;

  const compactValue = normalizedValue.replace(/\s+/g, "");
  if (compactValue && searchIndex.compact.includes(compactValue)) {
    return true;
  }

  const boundaryPattern = new RegExp(
    `(^|\\s)${escapeRegExp(normalizedValue)}(?=\\s|$)`,
    "i",
  );
  return boundaryPattern.test(searchIndex.normalized);
}

function uniqueSuggestions(items: string[], maxItems = 7): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= maxItems) break;
  }

  return result;
}

function uniqueKeywordList(items: string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items || []) {
    const trimmed = item.trim();
    const key = compactKeywordValue(trimmed);
    if (!trimmed || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function reconcileKeywordBuckets(
  matchedItems: string[] | undefined,
  missingItems: string[] | undefined,
  searchIndex: { normalized: string; compact: string },
): { matched: string[]; missing: string[] } {
  const matched = uniqueKeywordList(matchedItems);
  const missing = uniqueKeywordList(missingItems);
  const matchedKeys = new Set(matched.map((item) => compactKeywordValue(item)));
  const reconciledMissing: string[] = [];

  for (const item of missing) {
    const key = compactKeywordValue(item);
    if (!key || matchedKeys.has(key)) continue;

    if (resumeContainsKeyword(searchIndex, item)) {
      matched.push(item);
      matchedKeys.add(key);
      continue;
    }

    reconciledMissing.push(item);
  }

  return { matched, missing: reconciledMissing };
}

function sanitizeATSResultLists(
  result: ATSResult,
  resumeData: ResumeData,
): ATSResult {
  const searchIndex = buildResumeSearchIndex(resumeData);
  const keywordBuckets = reconcileKeywordBuckets(
    result.breakdown.keywordMatch.matchedKeywords,
    result.breakdown.keywordMatch.missingKeywords,
    searchIndex,
  );
  const skillBuckets = reconcileKeywordBuckets(
    result.breakdown.skillsAlignment.matchedSkills,
    result.breakdown.skillsAlignment.missingSkills,
    searchIndex,
  );

  return {
    ...result,
    breakdown: {
      ...result.breakdown,
      keywordMatch: {
        ...result.breakdown.keywordMatch,
        matchedKeywords: keywordBuckets.matched,
        missingKeywords: keywordBuckets.missing,
      },
      skillsAlignment: {
        ...result.breakdown.skillsAlignment,
        matchedSkills: skillBuckets.matched,
        missingSkills: skillBuckets.missing,
      },
    },
  };
}

export const atsResultTestUtils = {
  sanitizeATSResultLists,
  countOutstandingKeywords: (atsResult: ATSResult) =>
    countOutstandingKeywords(atsResult),
  evaluateOptimizationStep: (
    beforeRewrite: ATSResult,
    afterRewrite: ATSResult,
  ) => evaluateOptimizationStep(beforeRewrite, afterRewrite),
};

export function enrichATSResult(
  result: ATSResult,
  resumeData: ResumeData,
): ATSResult {
  const normalizedResult = sanitizeATSResultLists(result, resumeData);
  const qualityInsights = analyzeResumeFeedback(resumeData, {
    matchedKeywords: [
      ...(normalizedResult.breakdown.keywordMatch.matchedKeywords || []),
      ...(normalizedResult.breakdown.skillsAlignment.matchedSkills || []),
    ],
    missingKeywords: [
      ...(normalizedResult.breakdown.keywordMatch.missingKeywords || []),
      ...(normalizedResult.breakdown.skillsAlignment.missingSkills || []),
    ],
  });

  return {
    ...normalizedResult,
    topSuggestions: uniqueSuggestions([
      ...qualityInsights.suggestedEdits,
      ...normalizedResult.topSuggestions,
    ]),
    qualityInsights,
  };
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatAPIResponse {
  choices: { message: { content: string } }[];
}

export function extractJSON(text: string): string {
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
  signal?: AbortSignal,
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
        signal,
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

/* ── Groq fallback ───────────────────────────────────── */

interface GroqResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

async function callGroq(
  settings: AISettings,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  if (!settings.groqApiKey) {
    throw new Error("Groq API key is not set.");
  }

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings.groqModel,
        messages,
        temperature: 0.3,
        max_tokens: 16000,
      }),
      signal,
    },
  );

  if (!response.ok) {
    const errBody = await response.text();
    if (response.status === 429) {
      throw new Error("Groq rate limit exceeded. Please wait and try again.");
    }
    throw new Error(`Groq API error (${response.status}): ${errBody}`);
  }

  const data = (await response.json()) as GroqResponse;
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("Groq returned no content.");
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
  signal?: AbortSignal,
): Promise<string> {
  return withRetry(async () => {
    signal?.throwIfAborted();
    try {
      return await callGitHub(settings, messages, signal);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // If all GitHub tokens are rate limited, fall back to Groq
      if (msg === "ALL_GITHUB_RATE_LIMITED" && settings.groqApiKey) {
        console.warn("All GitHub tokens rate limited — falling back to Groq");
        return callGroq(settings, messages, signal);
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

  const rawResponse = await callAI(settings, messages);

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

  return finalizeOptimizedResume(parsed, resumeData);
}

/**
 * Restore links from the original resume data that AI may have dropped.
 * Matches by project title, achievement text, certificate name.
 */
function restoreLinks(parsed: ResumeData, original: ResumeData): void {
  // Restore project links
  if (parsed.projects && original.projects) {
    for (const proj of parsed.projects) {
      const orig = original.projects.find(
        (o) => o.title.toLowerCase().trim() === proj.title.toLowerCase().trim(),
      );
      if (orig) {
        if (!proj.githubLink && orig.githubLink)
          proj.githubLink = orig.githubLink;
        if (!proj.liveLink && orig.liveLink) proj.liveLink = orig.liveLink;
      }
    }
  }
  // Restore achievement links
  if (parsed.achievements && original.achievements) {
    for (let i = 0; i < parsed.achievements.length; i++) {
      const orig = original.achievements[i];
      if (orig && !parsed.achievements[i].githubLink && orig.githubLink) {
        parsed.achievements[i].githubLink = orig.githubLink;
      }
    }
  }
  // Restore certificate links
  if (parsed.certificates && original.certificates) {
    for (const cert of parsed.certificates) {
      const orig = original.certificates.find(
        (o) => o.name.toLowerCase().trim() === cert.name.toLowerCase().trim(),
      );
      if (orig && !cert.link && orig.link) {
        cert.link = orig.link;
      }
    }
  }
}

export function finalizeOptimizedResume(
  parsed: ResumeData,
  originalResume: ResumeData,
): ResumeData {
  parsed.contact = originalResume.contact;
  parsed.education = originalResume.education;
  parsed.certificates = originalResume.certificates;
  parsed.showCertificates = originalResume.showCertificates;
  parsed.sectionOrder = originalResume.sectionOrder;
  if (!parsed.experience) parsed.experience = originalResume.experience;
  parsed.showExperience = originalResume.showExperience;
  restoreLinks(parsed, originalResume);
  return parsed;
}

export function parseATSResultResponse(
  rawResponse: string,
  resumeData: ResumeData,
  errorLabel: string,
): ATSResult {
  const jsonStr = extractJSON(rawResponse);

  let parsed: ATSResult;
  try {
    parsed = JSON.parse(jsonStr) as ATSResult;
  } catch {
    throw new Error(
      `AI returned invalid JSON for ${errorLabel}. Try again.\n\nRaw response preview: ${rawResponse.substring(0, 300)}...`,
    );
  }

  if (
    typeof parsed.overallScore !== "number" ||
    !parsed.breakdown ||
    !parsed.topSuggestions
  ) {
    throw new Error(
      `AI response is missing required fields for ${errorLabel}.`,
    );
  }

  parsed.overallScore = Math.max(
    0,
    Math.min(100, Math.round(parsed.overallScore)),
  );

  return enrichATSResult(parsed, resumeData);
}

export function parseOptimizedResumeResponse(
  rawResponse: string,
  originalResume: ResumeData,
  errorLabel: string,
): ResumeData {
  const jsonStr = extractJSON(rawResponse);

  let parsed: ResumeData;
  try {
    parsed = JSON.parse(jsonStr) as ResumeData;
  } catch {
    throw new Error(
      `AI returned invalid JSON for ${errorLabel}. Try again.\n\nRaw response preview: ${rawResponse.substring(0, 300)}...`,
    );
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !parsed.summary ||
    !parsed.projects ||
    !parsed.skills
  ) {
    throw new Error(
      `AI response is missing required fields for ${errorLabel}.`,
    );
  }

  return finalizeOptimizedResume(parsed, originalResume);
}

let serverAuthTokenGetter: (() => Promise<string | null>) | null = null;

export function setServerAuthTokenGetter(
  getter: (() => Promise<string | null>) | null,
): void {
  serverAuthTokenGetter = getter;
}

export async function postServerAIRequest<TRequest, TResponse>(
  path: string,
  payload: TRequest,
  signal?: AbortSignal,
): Promise<TResponse> {
  if (!serverAuthTokenGetter) {
    throw new Error("Please sign in to continue.");
  }

  const token = await serverAuthTokenGetter();
  if (!token) {
    throw new Error("Please sign in to continue.");
  }

  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`.trim();
    if (!message) {
      message = `Request failed with status ${response.status}.`;
    }

    try {
      const bodyText = await response.text();

      if (bodyText.trim()) {
        try {
          const body = JSON.parse(bodyText) as {
            error?: string;
            message?: string;
          };

          if (body.error?.trim()) {
            message = body.error.trim();
          } else if (body.message?.trim()) {
            message = body.message.trim();
          } else if (response.status >= 500) {
            message = "Server error. Please try again in a moment.";
          }
        } catch {
          if (response.status >= 500) {
            message = "Server error. Please try again in a moment.";
          } else {
            message = bodyText.trim().slice(0, 240);
          }
        }
      } else if (response.status >= 500) {
        message = "Server error. Please try again in a moment.";
      }
    } catch {
      if (response.status >= 500) {
        message = "Server error. Please try again in a moment.";
      }
    }

    throw new Error(message);
  }

  return (await response.json()) as TResponse;
}

async function analyzeATSViaServer(
  resumeData: ResumeData,
  jobDescription: string,
  signal?: AbortSignal,
): Promise<ATSResult> {
  const cacheAllowed = loadPrivacySettings().cacheAIResponses;
  const response = await postServerAIRequest<
    AnalyzeATSRequest,
    AnalyzeATSResponse
  >(
    "/api/ats/analyze",
    {
      resumeData,
      jobDescription,
      mode: "jd",
      cacheAllowed,
    },
    signal,
  );
  return response.atsResult;
}

async function selfATSViaServer(
  resumeData: ResumeData,
  signal?: AbortSignal,
): Promise<ATSResult> {
  const cacheAllowed = loadPrivacySettings().cacheAIResponses;
  const response = await postServerAIRequest<
    AnalyzeATSRequest,
    AnalyzeATSResponse
  >(
    "/api/ats/analyze",
    {
      resumeData,
      mode: "self",
      cacheAllowed,
    },
    signal,
  );
  return response.atsResult;
}

async function rewriteResumeViaServer(
  resumeData: ResumeData,
  jobDescription: string,
  atsResult: ATSResult,
  iteration: number,
  signal?: AbortSignal,
): Promise<ResumeData> {
  const cacheAllowed = loadPrivacySettings().cacheAIResponses;
  const response = await postServerAIRequest<
    RewriteResumeRequest,
    RewriteResumeResponse
  >(
    "/api/optimize/rewrite",
    {
      resumeData,
      jobDescription,
      atsResult,
      iteration,
      mode: "jd",
      cacheAllowed,
    },
    signal,
  );
  return response.resumeData;
}

async function rewriteSelfResumeViaServer(
  resumeData: ResumeData,
  atsResult: ATSResult,
  iteration: number,
  signal?: AbortSignal,
): Promise<ResumeData> {
  const cacheAllowed = loadPrivacySettings().cacheAIResponses;
  const response = await postServerAIRequest<
    RewriteResumeRequest,
    RewriteResumeResponse
  >(
    "/api/optimize/rewrite",
    {
      resumeData,
      atsResult,
      iteration,
      mode: "self",
      cacheAllowed,
    },
    signal,
  );
  return response.resumeData;
}

export async function analyzeATSScore(
  _settings: AISettings,
  resumeData: ResumeData,
  jobDescription: string,
  signal?: AbortSignal,
): Promise<ATSResult> {
  // Check cache first
  const cacheKey = getCacheKey(
    "ats",
    JSON.stringify(resumeData),
    jobDescription,
  );
  const cached = getCached<ATSResult>(cacheKey);
  if (cached) {
    console.warn("ATS score loaded from cache");
    const enrichedCached = enrichATSResult(cached, resumeData);
    setCache(cacheKey, enrichedCached);
    return enrichedCached;
  }

  const parsed = await analyzeATSViaServer(resumeData, jobDescription, signal);
  setCache(cacheKey, parsed);
  return parsed;
}

// ─── Self ATS Score (No JD) ─────────────────────────────

export async function selfATSScore(
  _settings: AISettings,
  resumeData: ResumeData,
  signal?: AbortSignal,
): Promise<ATSResult> {
  // Check cache first
  const cacheKey = getCacheKey("self-ats", JSON.stringify(resumeData));
  const cached = getCached<ATSResult>(cacheKey);
  if (cached) {
    console.warn("Self ATS score loaded from cache");
    const enrichedCached = enrichATSResult(cached, resumeData);
    setCache(cacheKey, enrichedCached);
    return enrichedCached;
  }

  const parsed = await selfATSViaServer(resumeData, signal);
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
  finalATSResult: ATSResult | null;
  finalScore: number;
  error?: string;
}

interface OptimizationStepDecision {
  scoreGain: number;
  missingKeywordImprovement: number;
  shouldContinue: boolean;
}

function countOutstandingKeywords(atsResult: ATSResult): number {
  return uniqueKeywordList([
    ...(atsResult.breakdown.keywordMatch.missingKeywords || []),
    ...(atsResult.breakdown.skillsAlignment.missingSkills || []),
  ]).length;
}

function evaluateOptimizationStep(
  beforeRewrite: ATSResult,
  afterRewrite: ATSResult,
): OptimizationStepDecision {
  const scoreGain = afterRewrite.overallScore - beforeRewrite.overallScore;
  const missingKeywordImprovement =
    countOutstandingKeywords(beforeRewrite) -
    countOutstandingKeywords(afterRewrite);

  return {
    scoreGain,
    missingKeywordImprovement,
    shouldContinue: scoreGain >= 3 && missingKeywordImprovement > 0,
  };
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
  let currentATSResult: ATSResult | null = null;
  let bestScore = 0;
  let bestResume = currentResume;
  let bestATSResult: ATSResult | null = null;

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
        finalATSResult: bestATSResult,
        finalScore: bestScore,
        error: "Cancelled",
      };
      onProgress(progress);
      return progress;
    }

    if (!currentATSResult) {
      onProgress({
        currentIteration: i,
        maxIterations,
        phase: "scanning",
        message: `Iteration ${i}/${maxIterations}: Scanning resume with ATS...`,
        history,
        finalResume: null,
        finalATSResult: null,
        finalScore: bestScore,
      });

      try {
        currentATSResult = await analyzeATSScore(
          settings,
          currentResume,
          jobDescription,
          abortSignal,
        );
      } catch (err) {
        const progress: OptimizeProgress = {
          currentIteration: i,
          maxIterations,
          phase: "error",
          message: `ATS scan failed on iteration ${i}.`,
          history,
          finalResume: bestResume,
          finalATSResult: bestATSResult,
          finalScore: bestScore,
          error: err instanceof Error ? err.message : "ATS scan failed",
        };
        onProgress(progress);
        return progress;
      }

      bestScore = currentATSResult.overallScore;
      bestResume = currentResume;
      bestATSResult = currentATSResult;
    }

    if (currentATSResult.overallScore >= targetScore) {
      const progress: OptimizeProgress = {
        currentIteration: i,
        maxIterations,
        phase: "target-reached",
        message: `Target reached! Score: ${currentATSResult.overallScore}/100 after ${i} iteration(s).`,
        history: [
          ...history,
          {
            iteration: i,
            atsResult: currentATSResult,
            resumeData: currentResume,
            phase: "done",
          },
        ],
        finalResume: currentResume,
        finalATSResult: currentATSResult,
        finalScore: currentATSResult.overallScore,
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
      message: `Iteration ${i}/${maxIterations}: Score ${currentATSResult.overallScore}/100 - AI is rewriting to fix gaps...`,
      history,
      finalResume: null,
      finalATSResult: null,
      finalScore: bestScore,
    });

    let rewrittenResume: ResumeData;
    try {
      rewrittenResume = await rewriteResumeViaServer(
        currentResume,
        jobDescription,
        currentATSResult,
        i,
        abortSignal,
      );
    } catch (err) {
      const progress: OptimizeProgress = {
        currentIteration: i,
        maxIterations,
        phase: "error",
        message: `AI rewrite failed on iteration ${i}.`,
        history,
        finalResume: bestResume,
        finalATSResult: bestATSResult,
        finalScore: bestScore,
        error: err instanceof Error ? err.message : "AI rewrite failed",
      };
      onProgress(progress);
      return progress;
    }

    onProgress({
      currentIteration: i,
      maxIterations,
      phase: "scanning",
      message: `Iteration ${i}/${maxIterations}: Verifying rewritten resume...`,
      history,
      finalResume: null,
      finalATSResult: null,
      finalScore: bestScore,
    });

    let verifiedATSResult: ATSResult;
    try {
      verifiedATSResult = await analyzeATSScore(
        settings,
        rewrittenResume,
        jobDescription,
        abortSignal,
      );
    } catch (err) {
      const progress: OptimizeProgress = {
        currentIteration: i,
        maxIterations,
        phase: "error",
        message: `AI rewrite failed on iteration ${i}.`,
        history,
        finalResume: bestResume,
        finalATSResult: bestATSResult,
        finalScore: bestScore,
        error: err instanceof Error ? err.message : "AI rewrite failed",
      };
      onProgress(progress);
      return progress;
    }

    history.push({
      iteration: i,
      atsResult: verifiedATSResult,
      resumeData: rewrittenResume,
      phase: "done",
    });

    if (verifiedATSResult.overallScore > bestScore) {
      bestScore = verifiedATSResult.overallScore;
      bestResume = rewrittenResume;
      bestATSResult = verifiedATSResult;
    }

    if (verifiedATSResult.overallScore >= targetScore) {
      const progress: OptimizeProgress = {
        currentIteration: i,
        maxIterations,
        phase: "target-reached",
        message: `Target reached! Score: ${verifiedATSResult.overallScore}/100 after ${i} iteration(s).`,
        history,
        finalResume: rewrittenResume,
        finalATSResult: verifiedATSResult,
        finalScore: verifiedATSResult.overallScore,
      };
      onProgress(progress);
      return progress;
    }

    const stepDecision = evaluateOptimizationStep(
      currentATSResult,
      verifiedATSResult,
    );

    currentResume = rewrittenResume;
    currentATSResult = verifiedATSResult;

    if (i < maxIterations && !stepDecision.shouldContinue) {
      const progress: OptimizeProgress = {
        currentIteration: i,
        maxIterations,
        phase: "done",
        message: `Stopped after ${i} iteration(s) because improvements plateaued (score change ${stepDecision.scoreGain >= 0 ? "+" : ""}${stepDecision.scoreGain}, missing-keyword improvement ${stepDecision.missingKeywordImprovement}).`,
        history,
        finalResume: bestResume,
        finalATSResult: bestATSResult,
        finalScore: bestScore,
      };
      onProgress(progress);
      return progress;
    }
  }

  // Exhausted all iterations — return best result
  const progress: OptimizeProgress = {
    currentIteration: maxIterations,
    maxIterations,
    phase: "done",
    message: `Completed ${maxIterations} iterations. Best score: ${bestScore}/100.`,
    history,
    finalResume: bestResume,
    finalATSResult: bestATSResult,
    finalScore: bestScore,
  };
  onProgress(progress);
  return progress;
}

// ─── Self-Optimize Loop (No JD) ─────────────────────────

export async function selfOptimizeLoop(
  settings: AISettings,
  resumeData: ResumeData,
  targetScore: number,
  maxIterations: number,
  onProgress: (progress: OptimizeProgress) => void,
  abortSignal?: AbortSignal,
): Promise<OptimizeProgress> {
  const history: OptimizeIteration[] = [];
  let currentResume = { ...resumeData };
  let currentATSResult: ATSResult | null = null;
  let bestScore = 0;
  let bestResume = currentResume;
  let bestATSResult: ATSResult | null = null;

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
        finalATSResult: bestATSResult,
        finalScore: bestScore,
        error: "Cancelled",
      };
      onProgress(progress);
      return progress;
    }

    if (!currentATSResult) {
      onProgress({
        currentIteration: i,
        maxIterations,
        phase: "scanning",
        message: `Iteration ${i}/${maxIterations}: Self-scoring resume...`,
        history,
        finalResume: null,
        finalATSResult: null,
        finalScore: bestScore,
      });

      try {
        currentATSResult = await selfATSScore(
          settings,
          currentResume,
          abortSignal,
        );
      } catch (err) {
        const progress: OptimizeProgress = {
          currentIteration: i,
          maxIterations,
          phase: "error",
          message: `Self ATS scan failed on iteration ${i}.`,
          history,
          finalResume: bestResume,
          finalATSResult: bestATSResult,
          finalScore: bestScore,
          error: err instanceof Error ? err.message : "Self ATS scan failed",
        };
        onProgress(progress);
        return progress;
      }

      bestScore = currentATSResult.overallScore;
      bestResume = currentResume;
      bestATSResult = currentATSResult;
    }

    if (currentATSResult.overallScore >= targetScore) {
      const progress: OptimizeProgress = {
        currentIteration: i,
        maxIterations,
        phase: "target-reached",
        message: `Target reached! Score: ${currentATSResult.overallScore}/100 after ${i} iteration(s).`,
        history: [
          ...history,
          {
            iteration: i,
            atsResult: currentATSResult,
            resumeData: currentResume,
            phase: "done",
          },
        ],
        finalResume: currentResume,
        finalATSResult: currentATSResult,
        finalScore: currentATSResult.overallScore,
      };
      onProgress(progress);
      return progress;
    }

    // Phase 2: Self-optimize rewrite
    if (abortSignal?.aborted) break;

    onProgress({
      currentIteration: i,
      maxIterations,
      phase: "rewriting",
      message: `Iteration ${i}/${maxIterations}: Score ${currentATSResult.overallScore}/100 - AI is improving resume...`,
      history,
      finalResume: null,
      finalATSResult: null,
      finalScore: bestScore,
    });

    let rewrittenResume: ResumeData;
    try {
      rewrittenResume = await rewriteSelfResumeViaServer(
        currentResume,
        currentATSResult,
        i,
        abortSignal,
      );
    } catch (err) {
      const progress: OptimizeProgress = {
        currentIteration: i,
        maxIterations,
        phase: "error",
        message: `AI rewrite failed on iteration ${i}.`,
        history,
        finalResume: bestResume,
        finalATSResult: bestATSResult,
        finalScore: bestScore,
        error: err instanceof Error ? err.message : "AI rewrite failed",
      };
      onProgress(progress);
      return progress;
    }

    onProgress({
      currentIteration: i,
      maxIterations,
      phase: "scanning",
      message: `Iteration ${i}/${maxIterations}: Verifying rewritten resume...`,
      history,
      finalResume: null,
      finalATSResult: null,
      finalScore: bestScore,
    });

    let verifiedATSResult: ATSResult;
    try {
      verifiedATSResult = await selfATSScore(
        settings,
        rewrittenResume,
        abortSignal,
      );
    } catch (err) {
      const progress: OptimizeProgress = {
        currentIteration: i,
        maxIterations,
        phase: "error",
        message: `AI rewrite failed on iteration ${i}.`,
        history,
        finalResume: bestResume,
        finalATSResult: bestATSResult,
        finalScore: bestScore,
        error: err instanceof Error ? err.message : "AI rewrite failed",
      };
      onProgress(progress);
      return progress;
    }

    history.push({
      iteration: i,
      atsResult: verifiedATSResult,
      resumeData: rewrittenResume,
      phase: "done",
    });

    if (verifiedATSResult.overallScore > bestScore) {
      bestScore = verifiedATSResult.overallScore;
      bestResume = rewrittenResume;
      bestATSResult = verifiedATSResult;
    }

    if (verifiedATSResult.overallScore >= targetScore) {
      const progress: OptimizeProgress = {
        currentIteration: i,
        maxIterations,
        phase: "target-reached",
        message: `Target reached! Score: ${verifiedATSResult.overallScore}/100 after ${i} iteration(s).`,
        history,
        finalResume: rewrittenResume,
        finalATSResult: verifiedATSResult,
        finalScore: verifiedATSResult.overallScore,
      };
      onProgress(progress);
      return progress;
    }

    const stepDecision = evaluateOptimizationStep(
      currentATSResult,
      verifiedATSResult,
    );

    currentResume = rewrittenResume;
    currentATSResult = verifiedATSResult;

    if (i < maxIterations && !stepDecision.shouldContinue) {
      const progress: OptimizeProgress = {
        currentIteration: i,
        maxIterations,
        phase: "done",
        message: `Stopped after ${i} iteration(s) because improvements plateaued (score change ${stepDecision.scoreGain >= 0 ? "+" : ""}${stepDecision.scoreGain}, missing-keyword improvement ${stepDecision.missingKeywordImprovement}).`,
        history,
        finalResume: bestResume,
        finalATSResult: bestATSResult,
        finalScore: bestScore,
      };
      onProgress(progress);
      return progress;
    }
  }

  // Exhausted all iterations — return best result
  const progress: OptimizeProgress = {
    currentIteration: maxIterations,
    maxIterations,
    phase: "done",
    message: `Completed ${maxIterations} iterations. Best score: ${bestScore}/100.`,
    history,
    finalResume: bestResume,
    finalATSResult: bestATSResult,
    finalScore: bestScore,
  };
  onProgress(progress);
  return progress;
}

// ─── Resume Parser ───────────────────────────────────────

export async function parseResumeFromText(
  _settings: AISettings,
  resumeText: string,
  extractedLinks?: string[],
  signal?: AbortSignal,
): Promise<ResumeData> {
  // Check cache first
  const cacheKey = getCacheKey(
    "parse",
    resumeText,
    extractedLinks?.join(",") || "",
  );
  const cached = getCached<ResumeData>(cacheKey);
  if (cached) {
    console.warn("Parsed resume loaded from cache");
    return cached;
  }

  const cacheAllowed = loadPrivacySettings().cacheAIResponses;
  const response = await postServerAIRequest<
    ParseResumeRequest,
    ParseResumeResponse
  >(
    "/api/parse/resume",
    {
      resumeText,
      extractedLinks,
      cacheAllowed,
    },
    signal,
  );

  const parsed = response.resumeData;

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
