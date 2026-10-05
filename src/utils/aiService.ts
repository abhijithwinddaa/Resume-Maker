import type { AISettings } from "../types/aiSettings";
import type { ResumeData } from "../types/resume";
import {
  buildResumeSearchIndex,
  compactKeywordValue,
  resumeContainsKeyword,
} from "./keywordMatch";
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

export interface KeywordSuggestion {
  section: "experience" | "projects";
  index: number;
  editType: "rewrite" | "new";
  bulletIndex?: number;
  originalText?: string;
  suggestedText: string;
  keyword: string;
  reason: string;
}

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

// ─── Keyword Gap Analysis ──────────────────────────────

export async function getKeywordPlacements(
  resumeData: ResumeData,
  missingKeywords: string[],
  jobDescription?: string,
  signal?: AbortSignal,
): Promise<Record<string, KeywordSuggestion[]>> {
  const response = await postServerAIRequest<
    { resumeData: ResumeData; missingKeywords: string[]; jobDescription?: string },
    { suggestions: Record<string, KeywordSuggestion[]> }
  >(
    "/api/optimize/keyword-placement",
    { resumeData, missingKeywords, jobDescription },
    signal,
  );
  return response.suggestions;
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

  // A missing name is left for the user to fill in — the server already
  // rejects parses with no content at all.
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
