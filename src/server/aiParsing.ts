import {
  analyzeResumeFeedback,
  type ResumeFeedbackInsights,
} from "../utils/resumeFeedback.js";
import type { ResumeData } from "../types/resume.js";

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

export function extractJSON(text: string): string {
  const trimmed = text.trim();

  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // ignore
  }

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const extracted = trimmed.substring(firstBrace, lastBrace + 1);
    try {
      JSON.parse(extracted);
      return extracted;
    } catch {
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

  let repaired = json;
  if (inString) repaired += '"';

  for (let i = 0; i < openBrackets; i++) repaired += "]";
  for (let i = 0; i < openBraces; i++) repaired += "}";

  return repaired;
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

function enrichATSResult(result: ATSResult, resumeData: ResumeData): ATSResult {
  const qualityInsights = analyzeResumeFeedback(resumeData, {
    matchedKeywords: [
      ...(result.breakdown.keywordMatch.matchedKeywords || []),
      ...(result.breakdown.skillsAlignment.matchedSkills || []),
    ],
    missingKeywords: [
      ...(result.breakdown.keywordMatch.missingKeywords || []),
      ...(result.breakdown.skillsAlignment.missingSkills || []),
    ],
  });

  return {
    ...result,
    topSuggestions: uniqueSuggestions([
      ...qualityInsights.suggestedEdits,
      ...result.topSuggestions,
    ]),
    qualityInsights,
  };
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
    !Array.isArray(parsed.topSuggestions)
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

function restoreLinks(parsed: ResumeData, original: ResumeData): void {
  if (parsed.projects && original.projects) {
    for (const project of parsed.projects) {
      const originalProject = original.projects.find(
        (item) =>
          item.title.toLowerCase().trim() ===
          project.title.toLowerCase().trim(),
      );
      if (originalProject) {
        if (!project.githubLink && originalProject.githubLink) {
          project.githubLink = originalProject.githubLink;
        }
        if (!project.liveLink && originalProject.liveLink) {
          project.liveLink = originalProject.liveLink;
        }
      }
    }
  }

  if (parsed.achievements && original.achievements) {
    for (let i = 0; i < parsed.achievements.length; i++) {
      const originalAchievement = original.achievements[i];
      if (
        originalAchievement &&
        !parsed.achievements[i].githubLink &&
        originalAchievement.githubLink
      ) {
        parsed.achievements[i].githubLink = originalAchievement.githubLink;
      }
    }
  }

  if (parsed.certificates && original.certificates) {
    for (const certificate of parsed.certificates) {
      const originalCertificate = original.certificates.find(
        (item) =>
          item.name.toLowerCase().trim() ===
          certificate.name.toLowerCase().trim(),
      );
      if (
        originalCertificate &&
        !certificate.link &&
        originalCertificate.link
      ) {
        certificate.link = originalCertificate.link;
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
  if (!parsed.experience) {
    parsed.experience = originalResume.experience;
  }
  parsed.showExperience = originalResume.showExperience;
  restoreLinks(parsed, originalResume);
  return parsed;
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
