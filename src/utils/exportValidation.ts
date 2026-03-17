import type { ResumeData } from "../types/resume";

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
  return PLACEHOLDER_PATTERN.test(text);
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
      results.push(`${path}: \"${rule.wrong}\" -> \"${rule.suggestion}\"`);
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

/** Validate resume data before export — checks required fields and placeholders */
export function validateForExport(data: ResumeData): ExportValidationResult {
  const errors: string[] = [];

  // Required fields
  if (!data.contact.name.trim()) {
    errors.push("Please add your full name");
  }
  if (!data.contact.email.trim()) {
    errors.push("Please add your email address");
  }

  // At least one content section with data
  const hasExperience =
    data.showExperience &&
    data.experience.some((e) => e.company.trim() || e.role.trim());
  const hasEducation = data.education.some(
    (e) => e.university.trim() || e.degree.trim(),
  );
  const hasProjects = data.projects.some((p) => p.title.trim());

  if (!hasExperience && !hasEducation && !hasProjects) {
    errors.push("Add at least one Experience, Education, or Project");
  }

  // At least one skill
  const hasSkills = data.skills.some((s) => s.label.trim() && s.skills.trim());
  if (!hasSkills) {
    errors.push("Add at least one skill");
  }

  // Placeholder detection
  const placeholderSections: string[] = [];
  findPlaceholders(data, "", placeholderSections);

  if (placeholderSections.length > 0) {
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

/** Calculate resume completeness percentage */
export function calculateCompleteness(data: ResumeData): {
  percentage: number;
  breakdown: { label: string; complete: boolean; weight: number }[];
} {
  const breakdown: { label: string; complete: boolean; weight: number }[] = [];

  // Personal info (20%)
  const contactFilled =
    !!data.contact.name.trim() &&
    !!data.contact.email.trim() &&
    !!data.contact.phone.trim();
  breakdown.push({
    label: "Personal Info",
    complete: contactFilled,
    weight: 20,
  });

  // Summary (10%)
  const hasSummary = !!data.summary.trim();
  breakdown.push({ label: "Summary", complete: hasSummary, weight: 10 });

  // Experience (20%)
  const hasExp =
    data.showExperience &&
    data.experience.some(
      (e) =>
        e.company.trim() && e.role.trim() && e.bullets.some((b) => b.trim()),
    );
  breakdown.push({ label: "Experience", complete: hasExp, weight: 20 });

  // Education (15%)
  const hasEdu = data.education.some(
    (e) => e.university.trim() && e.degree.trim(),
  );
  breakdown.push({ label: "Education", complete: hasEdu, weight: 15 });

  // Skills (15%)
  const hasSkills = data.skills.some((s) => s.label.trim() && s.skills.trim());
  breakdown.push({ label: "Skills", complete: hasSkills, weight: 15 });

  // Projects or Certifications (10%)
  const hasProjectsOrCerts =
    data.projects.some((p) => p.title.trim()) ||
    (data.showCertificates && data.certificates.some((c) => c.name.trim()));
  breakdown.push({
    label: "Projects / Certs",
    complete: hasProjectsOrCerts,
    weight: 10,
  });

  // LinkedIn or Portfolio (10%)
  const hasLinks =
    !!data.contact.linkedin.trim() || !!data.contact.portfolio.trim();
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
