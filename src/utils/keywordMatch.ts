import type { ResumeData } from "../types/resume";

/**
 * Keyword matching against resume text, tolerant of spelling variants
 * ("Node.js" / "NodeJS", "REST APIs" / "REST API"). Shared by the AI result
 * clean-up (aiService) and the on-device live check (liveScore).
 */

export interface ResumeSearchIndex {
  normalized: string;
  compact: string;
}

function normalizeKeywordValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeKeywordValue(value: string): string {
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

export function compactKeywordValue(value: string): string {
  return canonicalizeKeywordValue(value).replace(/\s+/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Layout and bookkeeping, not claims: section order lists "experience" and
 * "projects" as values, and section labels are headings.
 */
const NON_CONTENT_KEYS = new Set(["sectionOrder", "sectionLabels", "meta"]);

/** Every string the candidate wrote — values only, never field names. */
function collectText(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectText(item, out);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (!NON_CONTENT_KEYS.has(key)) collectText(item, out);
    }
  }
}

export function buildResumeSearchIndex(resumeData: ResumeData): ResumeSearchIndex {
  const text: string[] = [];
  collectText(resumeData, text);
  const normalized = ` ${canonicalizeKeywordValue(text.join(" \n "))} `;
  return {
    normalized,
    compact: normalized.replace(/\s+/g, ""),
  };
}

export function resumeContainsKeyword(
  searchIndex: ResumeSearchIndex,
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
