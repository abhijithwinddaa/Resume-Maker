import type { Experience, Project, ResumeData } from "../types/resume.js";
import { REDACTION_PLACEHOLDER } from "./aiRedaction.js";
import {
  filterGroundedList,
  knownTerms,
  resumeContentText,
  ungroundedTerms,
} from "./groundedTerms.js";

/**
 * Deterministic check that an AI rewrite did not invent facts.
 *
 * Optimizer prompts ask for quantified impact and keyword coverage, and models
 * fill the gap with plausible numbers ("reduced costs by 20%", "6+ years") and
 * tools ("Jest", "Kubernetes") the candidate never claimed — exactly what fails
 * them in an interview. Any number or tech-like term in the rewrite must
 * already appear in the original resume; text that introduces a new one falls
 * back to the original wording.
 */

const NUMBER_PATTERN = /\d+(?:[.,]\d+)*/g;

export function numbersIn(text: string): string[] {
  return (text.match(NUMBER_PATTERN) || []).map((n) => n.replace(/,/g, ""));
}

interface Known {
  numbers: Set<string>;
  terms: Set<string>;
}

/** True when `text` adds a number or a tool the original resume never had. */
function isInvented(text: string, known: Known): boolean {
  // A scrub placeholder echoed back by the model must never reach the resume.
  if (REDACTION_PLACEHOLDER.test(text)) return true;
  if (numbersIn(text).some((n) => !known.numbers.has(n))) return true;
  return ungroundedTerms(text, known.terms).length > 0;
}

const norm = (s: string | undefined) =>
  (s || "").toLowerCase().replace(/\s+/g, " ").trim();

const SIMILAR_STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "using", "used",
  "was", "were", "has", "have", "had", "are", "our", "all", "its", "of", "to",
  "in", "on", "by", "as", "a", "an", "or",
]);

function stem(word: string): string {
  return word.replace(/(?:ing|ed|es|s)$/, "");
}

function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of norm(text).split(/[^a-z0-9+#.]+/)) {
    if (w.length < 3 || SIMILAR_STOP.has(w)) continue;
    out.add(stem(w));
  }
  return out;
}

function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

const SIMILAR_THRESHOLD = 0.34;

// A bullet that says the candidate helped must not come back claiming they
// did it themselves ("Helped with testing" -> "Implemented unit tests"):
// models break the prompt's role rule often enough to need a hard check.
const SUPPORTING_ROLE = /^\s*(?:helped|assisted|supported|contributed|participated|collaborated|worked with|was part of|involved in)\b/i;
const KEEPS_SUPPORTING_ROLE = /\b(?:help|assist|support|contribut|partner|collaborat|participat|as part of|alongside|together with)/i;

function inflatesRole(bullet: string, original: string[]): string | null {
  const source = mostSimilar(bullet, original);
  if (!source || !SUPPORTING_ROLE.test(source)) return null;
  return KEEPS_SUPPORTING_ROLE.test(bullet) ? null : source;
}

function mostSimilar(text: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestScore = SIMILAR_THRESHOLD;
  for (const c of candidates) {
    const score = similarity(text, c);
    if (score >= bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Pair each rewritten entry with its original: first by identity (key), then
 * by a looser key, then by position — each original used at most once.
 * Returns, per rewritten entry, the index of its original (or -1).
 */
function matchEntries<T>(
  rewritten: T[],
  original: T[],
  keys: Array<(e: T) => string>,
): number[] {
  const used = new Set<number>();
  const result: number[] = rewritten.map(() => -1);
  for (const key of keys) {
    rewritten.forEach((entry, i) => {
      if (result[i] !== -1) return;
      const k = key(entry);
      if (!k) return;
      const j = original.findIndex((o, idx) => !used.has(idx) && key(o) === k);
      if (j !== -1) {
        result[i] = j;
        used.add(j);
      }
    });
  }
  rewritten.forEach((_, i) => {
    if (result[i] === -1 && i < original.length && !used.has(i)) {
      result[i] = i;
      used.add(i);
    }
  });
  return result;
}

const expKeys = [
  (e: Experience) => `${norm(e.company)}|${norm(e.role)}`,
  (e: Experience) => norm(e.company),
];
const projKeys = [(p: Project) => norm(p.title)];

/**
 * Keep each rewritten bullet unless it introduces an invented fact; then use
 * the most similar original bullet of the same entry, or drop it. Original
 * bullets the rewrite lost entirely are put back at the end.
 */
function guardBullets(
  rewritten: string[],
  original: string[],
  known: Known,
): string[] {
  const out: string[] = [];
  const push = (b: string) => {
    if (!out.some((o) => norm(o) === norm(b))) out.push(b);
  };
  for (const bullet of rewritten) {
    if (typeof bullet !== "string") continue;
    if (!isInvented(bullet, known)) {
      // A bullet that matches none of the entry's originals is new work the
      // candidate never described ("Designed responsive UI for…"): drop it.
      if (original.length > 0 && !mostSimilar(bullet, original)) continue;
      push(inflatesRole(bullet, original) ?? bullet);
      continue;
    }
    const fallback = mostSimilar(bullet, original);
    if (fallback) push(fallback);
  }
  // A truncated or over-eager rewrite can lose bullets: restore the missing.
  if (out.length < original.length) {
    for (const o of original) {
      if (out.length >= original.length) break;
      const represented = out.some(
        (b) => norm(b) === norm(o) || similarity(b, o) >= SIMILAR_THRESHOLD,
      );
      if (!represented) out.push(o);
    }
  }
  return out;
}

/** Achievements are kept as rewritten, minus any echoed scrub placeholder. */
function guardAchievements(
  rewritten: ResumeData,
  original: ResumeData,
): ResumeData["achievements"] {
  if (!rewritten.achievements) return original.achievements;
  const originalTexts = (original.achievements || []).map((a) => a.text || "");
  return rewritten.achievements.flatMap((a) => {
    if (!REDACTION_PLACEHOLDER.test(a.text || "")) return [a];
    const match = mostSimilar(a.text, originalTexts);
    const orig = (original.achievements || []).find((o) => o.text === match);
    return orig ? [orig] : [];
  });
}

export function revertInventedMetrics(
  rewritten: ResumeData,
  original: ResumeData,
): ResumeData {
  const known: Known = {
    numbers: new Set(numbersIn(resumeContentText(original).join("\n"))),
    terms: knownTerms(original),
  };

  const rewrittenExp = rewritten.experience || [];
  const originalExp = original.experience || [];
  const expMatch = matchEntries(rewrittenExp, originalExp, expKeys);
  const experience = rewrittenExp.map((entry, i): Experience => {
    const orig = originalExp[expMatch[i]];
    return {
      ...entry,
      ...(orig && {
        id: orig.id ?? entry.id,
        role: orig.role,
        company: orig.company,
        dateRange: orig.dateRange,
        location: orig.location,
      }),
      bullets: guardBullets(entry.bullets || [], orig?.bullets || [], known),
    };
  });
  originalExp.forEach((orig, j) => {
    if (!expMatch.includes(j)) experience.push(orig);
  });

  const rewrittenProj = rewritten.projects || [];
  const originalProj = original.projects || [];
  const projMatch = matchEntries(rewrittenProj, originalProj, projKeys);
  const projects = rewrittenProj.map((entry, i): Project => {
    const orig = originalProj[projMatch[i]];
    return {
      ...entry,
      ...(orig && {
        id: orig.id ?? entry.id,
        title: orig.title,
        githubLink: orig.githubLink,
        liveLink: orig.liveLink,
      }),
      techStack:
        filterGroundedList(entry.techStack || "", known.terms) ||
        orig?.techStack ||
        "",
      bullets: guardBullets(entry.bullets || [], orig?.bullets || [], known),
    };
  });
  originalProj.forEach((orig, j) => {
    if (!projMatch.includes(j)) projects.push(orig);
  });

  // Skills may be reordered or regrouped, but never gain an item.
  const skills = (rewritten.skills || [])
    .map((cat) => ({ ...cat, skills: filterGroundedList(cat.skills || "", known.terms) }))
    .filter((cat) => cat.skills);

  return {
    ...rewritten,
    summary: isInvented(rewritten.summary || "", known)
      ? original.summary
      : rewritten.summary,
    experience,
    projects,
    skills: skills.length ? skills : original.skills,
    achievements: guardAchievements(rewritten, original),
  };
}
