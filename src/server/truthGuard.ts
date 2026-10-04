import type { ResumeData } from "../types/resume.js";

/**
 * Deterministic check that an AI rewrite did not invent metrics.
 *
 * Optimizer prompts ask for quantified impact, and models fill the gap with
 * plausible numbers ("reduced costs by 20%", "6+ years") the candidate never
 * claimed — exactly what fails them in an interview. Any number in the rewrite
 * must already appear somewhere in the original resume; text that introduces a
 * new one falls back to the original wording.
 */

const NUMBER_PATTERN = /\d+(?:[.,]\d+)*/g;

function numbersIn(text: string): string[] {
  return (text.match(NUMBER_PATTERN) || []).map((n) => n.replace(/,/g, ""));
}

function hasInventedNumber(text: string, known: Set<string>): boolean {
  return numbersIn(text).some((n) => !known.has(n));
}

/**
 * Keep each rewritten bullet unless it introduces a number; then use the
 * original bullet at that position, or drop it if the rewrite added it.
 */
function guardBullets(
  rewritten: string[],
  original: string[],
  known: Set<string>,
): string[] {
  return rewritten.flatMap((bullet, i) => {
    if (!hasInventedNumber(bullet, known)) return [bullet];
    return i < original.length ? [original[i]] : [];
  });
}

export function revertInventedMetrics(
  rewritten: ResumeData,
  original: ResumeData,
): ResumeData {
  const known = new Set(numbersIn(JSON.stringify(original)));

  return {
    ...rewritten,
    summary: hasInventedNumber(rewritten.summary || "", known)
      ? original.summary
      : rewritten.summary,
    experience: (rewritten.experience || []).map((entry, i) => ({
      ...entry,
      bullets: guardBullets(
        entry.bullets || [],
        original.experience?.[i]?.bullets || [],
        known,
      ),
    })),
    projects: (rewritten.projects || []).map((entry, i) => ({
      ...entry,
      bullets: guardBullets(
        entry.bullets || [],
        original.projects?.[i]?.bullets || [],
        known,
      ),
    })),
  };
}
