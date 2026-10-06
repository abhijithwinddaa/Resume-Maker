import type { ResumeData } from "../types/resume";
import { hasPlaceholder as hasNumberBlank } from "./quantify";

export interface ExportValidationResult {
  valid: boolean;
  errors: string[];
  hasPlaceholders: boolean;
  placeholderSections: string[];
  typoWarnings: string[];
}

const PLACEHOLDER_PATTERN = /\[PLACEHOLDER|\[CONFIRM|\[TODO|\[FILL/i;

interface TypoRule {
  pattern: RegExp;
  wrong: string;
  suggestion: string;
}

const TYPO_RULES: TypoRule[] = [
  { pattern: /\bSocket\.I0\b/i, wrong: "Socket.I0", suggestion: "Socket.IO" },
  { pattern: /\bGrog\s+LLM\b/i, wrong: "Grog LLM", suggestion: "Groq LLM" },
  { pattern: /\bOpenAl\b/i, wrong: "OpenAl", suggestion: "OpenAI" },
  { pattern: /\bUl\s+flows\b/i, wrong: "Ul flows", suggestion: "UI flows" },
  {
    pattern: /\b0S\/?Android\b/i,
    wrong: "0S/Android",
    suggestion: "OS/Android",
  },
];

/** Scan a string for placeholder patterns */
function containsPlaceholder(text: string): boolean {
  // Also the [X%] / [N] blanks "Add a result" leaves for the user to fill.
  return PLACEHOLDER_PATTERN.test(text) || hasNumberBlank(text);
}

/** Recursively scan all string values in an object for placeholder text */
function findPlaceholders(obj: unknown, path: string, results: string[]): void {
  if (typeof obj === "string") {
    if (containsPlaceholder(obj)) {
      results.push(path);
    }
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => findPlaceholders(item, `${path}[${i}]`, results));
    return;
  }
  if (obj && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      findPlaceholders(value, path ? `${path}.${key}` : key, results);
    }
  }
}

/** Scan all string values for known high-impact technical typos */
function findKnownTypos(
  obj: unknown,
  path: string,
  results: string[],
  seen: Set<string>,
): void {
  if (typeof obj === "string") {
    const text = obj.trim();
    if (!text) return;

    for (const rule of TYPO_RULES) {
      if (!rule.pattern.test(text)) continue;
      const key = `${path}|${rule.wrong}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(`${path}: "${rule.wrong}" -> "${rule.suggestion}"`);
    }
    return;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, i) =>
      findKnownTypos(item, `${path}[${i}]`, results, seen),
    );
    return;
  }

  if (obj && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      findKnownTypos(value, path ? `${path}.${key}` : key, results, seen);
    }
  }
}

const text = (v: unknown): string => (typeof v === "string" ? v : "");
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const filled = (v: unknown): boolean => text(v).trim().length > 0;

function countNumberBlanks(data: ResumeData): number {
  const bullets = [
    ...arr<{ bullets?: unknown }>(data?.experience).flatMap((e) => arr<string>(e?.bullets)),
    ...arr<{ bullets?: unknown }>(data?.projects).flatMap((p) => arr<string>(p?.bullets)),
  ];
  return bullets.filter(
    (b) => typeof b === "string" && hasNumberBlank(b) && !PLACEHOLDER_PATTERN.test(b),
  ).length;
}

/** Validate resume data before export — checks required fields and placeholders */
export function validateForExport(data: ResumeData): ExportValidationResult {
  const errors: string[] = [];

  // Required fields
  if (!filled(data?.contact?.name)) {
    errors.push("Please add your full name");
  }
  if (!filled(data?.contact?.email)) {
    errors.push("Please add your email address");
  }

  // At least one content section with data
  const hasExperience =
    !!data?.showExperience &&
    arr<ResumeData["experience"][number]>(data?.experience).some(
      (e) => filled(e?.company) || filled(e?.role),
    );
  const hasEducation = arr<ResumeData["education"][number]>(data?.education).some(
    (e) => filled(e?.university) || filled(e?.degree),
  );
  const hasProjects = arr<ResumeData["projects"][number]>(data?.projects).some((p) =>
    filled(p?.title),
  );

  if (!hasExperience && !hasEducation && !hasProjects) {
    errors.push("Add at least one Experience, Education, or Project");
  }

  // At least one skill
  const hasSkills = arr<ResumeData["skills"][number]>(data?.skills).some(
    (s) => filled(s?.label) && filled(s?.skills),
  );
  if (!hasSkills) {
    errors.push("Add at least one skill");
  }

  // Placeholder detection
  const placeholderSections: string[] = [];
  findPlaceholders(data, "", placeholderSections);

  const blankCount = countNumberBlanks(data);
  if (blankCount > 0) {
    errors.push(
      `Fill in the ${blankCount === 1 ? "[X] blank" : `${blankCount} [X] blanks`} in your bullets with your real numbers (estimates are fine), or remove ${blankCount === 1 ? "it" : "them"}.`,
    );
  }
  if (placeholderSections.length > blankCount) {
    errors.push(
      "Your resume has unfilled placeholder sections. Please review and complete all highlighted areas before exporting.",
    );
  }

  const typoWarnings: string[] = [];
  findKnownTypos(data, "", typoWarnings, new Set<string>());

  return {
    valid: errors.length === 0,
    errors,
    hasPlaceholders: placeholderSections.length > 0,
    placeholderSections,
    typoWarnings,
  };
}

/** Auto-fix all known typos in resume data, returning the corrected data and a list of fixes applied */
export function autoFixTypos(data: ResumeData): {
  fixed: ResumeData;
  corrections: string[];
} {
  const corrections: string[] = [];
  const clone: ResumeData = JSON.parse(JSON.stringify(data));

  if (typeof clone.summary !== "string") clone.summary = "";
  if (!Array.isArray(clone.experience)) clone.experience = [];
  if (!Array.isArray(clone.projects)) clone.projects = [];
  if (!Array.isArray(clone.skills)) clone.skills = [];
  if (!Array.isArray(clone.achievements)) clone.achievements = [];
  if (!Array.isArray(clone.certificates)) clone.certificates = [];

  function fixString(text: string, path: string): string {
    let result = text;
    for (const rule of TYPO_RULES) {
      if (rule.pattern.test(result)) {
        corrections.push(`${path}: "${rule.wrong}" → "${rule.suggestion}"`);
        result = result.replace(rule.pattern, rule.suggestion);
      }
    }
    return result;
  }

  // Fix summary
  clone.summary = fixString(clone.summary, "summary");

  // Fix experience bullets
  clone.experience.forEach((exp, i) => {
    exp.role = fixString(String(exp.role || ""), `experience[${i}].role`);
    exp.company = fixString(
      String(exp.company || ""),
      `experience[${i}].company`,
    );
    const bullets = Array.isArray(exp.bullets) ? exp.bullets : [];
    exp.bullets = bullets.map((b, j) =>
      fixString(text(b), `experience[${i}].bullets[${j}]`),
    );
  });

  // Fix project fields
  clone.projects.forEach((proj, i) => {
    proj.title = fixString(String(proj.title || ""), `projects[${i}].title`);
    proj.techStack = fixString(
      String(proj.techStack || ""),
      `projects[${i}].techStack`,
    );
    const bullets = Array.isArray(proj.bullets) ? proj.bullets : [];
    proj.bullets = bullets.map((b, j) =>
      fixString(text(b), `projects[${i}].bullets[${j}]`),
    );
  });

  // Fix skills
  clone.skills.forEach((skill, i) => {
    skill.label = fixString(String(skill.label || ""), `skills[${i}].label`);
    skill.skills = fixString(String(skill.skills || ""), `skills[${i}].skills`);
  });

  // Fix achievements
  clone.achievements.forEach((ach, i) => {
    ach.text = fixString(String(ach.text || ""), `achievements[${i}].text`);
  });

  // Fix certificates
  clone.certificates.forEach((cert, i) => {
    cert.name = fixString(String(cert.name || ""), `certificates[${i}].name`);
    cert.description = fixString(
      String(cert.description || ""),
      `certificates[${i}].description`,
    );
  });

  return { fixed: clone, corrections };
}

/** Calculate resume completeness percentage */
export function calculateCompleteness(data: ResumeData): {
  percentage: number;
  breakdown: { label: string; complete: boolean; weight: number }[];
} {
  const breakdown: { label: string; complete: boolean; weight: number }[] = [];

  // Personal info (20%)
  const contactFilled =
    filled(data?.contact?.name) &&
    filled(data?.contact?.email) &&
    filled(data?.contact?.phone);
  breakdown.push({
    label: "Personal Info",
    complete: contactFilled,
    weight: 20,
  });

  // Summary (10%)
  const hasSummary = filled(data?.summary);
  breakdown.push({ label: "Summary", complete: hasSummary, weight: 10 });

  // Experience (20%)
  const hasExp =
    !!data?.showExperience &&
    arr<ResumeData["experience"][number]>(data?.experience).some(
      (e) =>
        filled(e?.company) && filled(e?.role) && arr<string>(e?.bullets).some(filled),
    );
  breakdown.push({ label: "Experience", complete: hasExp, weight: 20 });

  // Education (15%)
  const hasEdu = arr<ResumeData["education"][number]>(data?.education).some(
    (e) => filled(e?.university) && filled(e?.degree),
  );
  breakdown.push({ label: "Education", complete: hasEdu, weight: 15 });

  // Skills (15%)
  const hasSkills = arr<ResumeData["skills"][number]>(data?.skills).some(
    (s) => filled(s?.label) && filled(s?.skills),
  );
  breakdown.push({ label: "Skills", complete: hasSkills, weight: 15 });

  // Projects or Certifications (10%)
  const hasProjectsOrCerts =
    arr<ResumeData["projects"][number]>(data?.projects).some((p) => filled(p?.title)) ||
    (!!data?.showCertificates &&
      arr<ResumeData["certificates"][number]>(data?.certificates).some((c) => filled(c?.name)));
  breakdown.push({
    label: "Projects / Certs",
    complete: hasProjectsOrCerts,
    weight: 10,
  });

  // LinkedIn or Portfolio (10%)
  const hasLinks = filled(data?.contact?.linkedin) || filled(data?.contact?.portfolio);
  breakdown.push({
    label: "LinkedIn / Portfolio",
    complete: hasLinks,
    weight: 10,
  });

  const percentage = breakdown.reduce(
    (sum, item) => sum + (item.complete ? item.weight : 0),
    0,
  );

  return { percentage, breakdown };
}
