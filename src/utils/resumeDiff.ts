import type { ResumeData } from "../types/resume";

/**
 * What an AI rewrite changed, piece by piece, so the user can accept or reject
 * each change instead of having the whole resume replaced.
 *
 * Bullets are compared by position within each entry (the optimizer keeps
 * entry order). Entries the AI dropped or invented are not offered: the user's
 * original entries always survive, and the AI cannot add new jobs.
 */

export type ResumeChangeKind = "modified" | "added" | "removed";

export interface ResumeChange {
  /** Stable key, e.g. "experience:0:bullet:2", "skills:1", "summary". */
  id: string;
  section: "summary" | "experience" | "projects" | "skills" | "achievements";
  /** Where the change is, for display: "Engineer — Brightcart". */
  location: string;
  kind: ResumeChangeKind;
  before: string;
  after: string;
}

function kindOf(before: string | undefined, after: string | undefined): ResumeChangeKind | null {
  const b = before?.trim() ?? "";
  const a = after?.trim() ?? "";
  if (b === a) return null;
  if (!b) return "added";
  if (!a) return "removed";
  return "modified";
}

function diffList(
  prefix: string,
  section: ResumeChange["section"],
  location: string,
  before: string[],
  after: string[],
): ResumeChange[] {
  const changes: ResumeChange[] = [];
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    const kind = kindOf(before[i], after[i]);
    if (!kind) continue;
    changes.push({
      id: `${prefix}:${i}`,
      section,
      location,
      kind,
      before: before[i]?.trim() ?? "",
      after: after[i]?.trim() ?? "",
    });
  }
  return changes;
}

function skillLine(skill: { label: string; skills: string } | undefined): string {
  if (!skill) return "";
  const label = skill.label.trim();
  const skills = skill.skills.trim();
  return label && skills ? `${label}: ${skills}` : label || skills;
}

export function diffResumes(original: ResumeData, optimized: ResumeData): ResumeChange[] {
  const changes: ResumeChange[] = [];

  const summaryKind = kindOf(original.summary, optimized.summary);
  if (summaryKind) {
    changes.push({
      id: "summary",
      section: "summary",
      location: "Summary",
      kind: summaryKind,
      before: original.summary.trim(),
      after: optimized.summary.trim(),
    });
  }

  original.experience.forEach((entry, i) => {
    const next = optimized.experience?.[i];
    if (!next) return;
    const location = [entry.role, entry.company].filter(Boolean).join(" — ") || `Experience ${i + 1}`;
    changes.push(
      ...diffList(`experience:${i}:bullet`, "experience", location, entry.bullets, next.bullets || []),
    );
  });

  original.projects.forEach((entry, i) => {
    const next = optimized.projects?.[i];
    if (!next) return;
    const location = entry.title || `Project ${i + 1}`;
    changes.push(
      ...diffList(`projects:${i}:bullet`, "projects", location, entry.bullets, next.bullets || []),
    );
    const stackKind = kindOf(entry.techStack, next.techStack);
    if (stackKind) {
      changes.push({
        id: `projects:${i}:techStack`,
        section: "projects",
        location: `${location} · tech stack`,
        kind: stackKind,
        before: entry.techStack.trim(),
        after: (next.techStack || "").trim(),
      });
    }
  });

  const skillCount = Math.max(original.skills.length, optimized.skills?.length ?? 0);
  for (let i = 0; i < skillCount; i++) {
    const before = skillLine(original.skills[i]);
    const after = skillLine(optimized.skills?.[i]);
    const kind = kindOf(before, after);
    if (!kind) continue;
    changes.push({ id: `skills:${i}`, section: "skills", location: "Skills", kind, before, after });
  }

  changes.push(
    ...diffList(
      "achievements",
      "achievements",
      "Achievements",
      original.achievements.map((a) => a.text),
      (optimized.achievements || []).map((a) => a.text),
    ),
  );

  return changes;
}

/**
 * Merge a list field: keep the original item unless its change was accepted.
 * An accepted addition is appended; an accepted removal drops the item.
 */
function mergeList<T>(
  prefix: string,
  before: T[],
  after: T[],
  accepted: Set<string>,
): T[] {
  const merged: T[] = [];
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    const take = accepted.has(`${prefix}:${i}`);
    if (i < before.length && i < after.length) {
      merged.push(take ? after[i] : before[i]);
    } else if (i < before.length) {
      if (!take) merged.push(before[i]); // removal rejected: keep it
    } else if (take) {
      merged.push(after[i]); // addition accepted
    }
  }
  return merged;
}

export function applyResumeChanges(
  original: ResumeData,
  optimized: ResumeData,
  accepted: Set<string>,
): ResumeData {
  const result = structuredClone(original);

  if (accepted.has("summary")) result.summary = optimized.summary;

  result.experience = result.experience.map((entry, i) => {
    const next = optimized.experience?.[i];
    if (!next) return entry;
    return {
      ...entry,
      bullets: mergeList(`experience:${i}:bullet`, entry.bullets, next.bullets || [], accepted),
    };
  });

  result.projects = result.projects.map((entry, i) => {
    const next = optimized.projects?.[i];
    if (!next) return entry;
    return {
      ...entry,
      bullets: mergeList(`projects:${i}:bullet`, entry.bullets, next.bullets || [], accepted),
      techStack: accepted.has(`projects:${i}:techStack`) ? next.techStack : entry.techStack,
    };
  });

  result.skills = mergeList("skills", result.skills, optimized.skills || [], accepted);
  result.achievements = mergeList(
    "achievements",
    result.achievements,
    optimized.achievements || [],
    accepted,
  );

  return result;
}
