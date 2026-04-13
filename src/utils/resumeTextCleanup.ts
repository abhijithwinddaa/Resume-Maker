import type { ResumeData } from "../types/resume";

const NBSP_REGEX = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g;

function cleanInlineText(value: string): string {
  let text = value.replace(NBSP_REGEX, " ");

  // Normalize extra whitespace first.
  text = text.replace(/[ \t]+/g, " ");

  // Remove spacing artifacts around punctuation and separators.
  text = text.replace(/\s+([,.;!?%])/g, "$1");
  text = text.replace(/\s+([)\]}])/g, "$1");
  text = text.replace(/([([{])\s+/g, "$1");
  text = text.replace(/\s*:\s*(?!\/\/)/g, ": ");
  text = text.replace(/,\s*/g, ", ");
  text = text.replace(/;\s*/g, "; ");

  // Fix split technical tokens (React . js, Node . js, Socket . IO, etc.).
  text = text.replace(/\b([A-Za-z]+)\s*\.\s*(js|ts|jsx|tsx)\b/gi, "$1.$2");
  text = text.replace(/\bSocket\s*\.\s*IO\b/gi, "Socket.IO");
  text = text.replace(/([A-Za-z0-9])\s*\.\s*([A-Za-z0-9])/g, "$1.$2");
  text = text.replace(/([A-Za-z0-9])\s*\/\s*([A-Za-z0-9])/g, "$1/$2");
  text = text.replace(/([A-Za-z0-9])\s*-\s*([A-Za-z0-9])/g, "$1-$2");

  // Rebuild broken URL prefixes from extracted/OCR text.
  text = text.replace(/https?\s*:\s*\/\s*\//gi, (match) =>
    match.toLowerCase().startsWith("https") ? "https://" : "http://",
  );
  text = text.replace(/(https?:\/\/)\s+/gi, "$1");

  text = text.replace(/\s{2,}/g, " ");
  return text.trim();
}

function cleanUrl(value: string): string {
  return value.replace(NBSP_REGEX, " ").replace(/\s+/g, "").trim();
}

export function normalizeExtractedResumeText(value: string): string {
  const normalized = value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => cleanInlineText(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized;
}

export function normalizeResumeDataSpacing(data: ResumeData): {
  normalized: ResumeData;
  changedFields: number;
} {
  const normalized: ResumeData = JSON.parse(JSON.stringify(data));
  let changedFields = 0;

  const applyInline = (value: string): string => {
    const current = value || "";
    const cleaned = cleanInlineText(current);
    if (cleaned !== current) changedFields += 1;
    return cleaned;
  };

  const applyUrl = (value: string): string => {
    const current = value || "";
    const cleaned = cleanUrl(current);
    if (cleaned !== current) changedFields += 1;
    return cleaned;
  };

  normalized.contact.name = applyInline(normalized.contact.name);
  normalized.contact.phone = applyInline(normalized.contact.phone);
  normalized.contact.email = applyUrl(normalized.contact.email);
  normalized.contact.linkedin = applyUrl(normalized.contact.linkedin);
  normalized.contact.github = applyUrl(normalized.contact.github);
  normalized.contact.portfolio = applyUrl(normalized.contact.portfolio);

  normalized.summary = applyInline(normalized.summary);

  if (!Array.isArray(normalized.education)) normalized.education = [];
  if (!Array.isArray(normalized.experience)) normalized.experience = [];
  if (!Array.isArray(normalized.projects)) normalized.projects = [];
  if (!Array.isArray(normalized.skills)) normalized.skills = [];
  if (!Array.isArray(normalized.achievements)) normalized.achievements = [];
  if (!Array.isArray(normalized.certificates)) normalized.certificates = [];

  normalized.education.forEach((entry) => {
    entry.university = applyInline(entry.university);
    entry.location = applyInline(entry.location);
    entry.degree = applyInline(entry.degree);
    entry.yearRange = applyInline(entry.yearRange);
    entry.cgpa = applyInline(entry.cgpa);
  });

  normalized.experience.forEach((entry) => {
    entry.company = applyInline(entry.company);
    entry.role = applyInline(entry.role);
    entry.location = applyInline(entry.location);
    entry.dateRange = applyInline(entry.dateRange);
    if (!Array.isArray(entry.bullets)) entry.bullets = [];
    entry.bullets = entry.bullets.map((bullet) => applyInline(bullet));
  });

  normalized.projects.forEach((entry) => {
    entry.title = applyInline(entry.title);
    entry.githubLink = applyUrl(entry.githubLink);
    entry.liveLink = applyUrl(entry.liveLink);
    entry.techStack = applyInline(entry.techStack);
    if (!Array.isArray(entry.bullets)) entry.bullets = [];
    entry.bullets = entry.bullets.map((bullet) => applyInline(bullet));
  });

  normalized.skills.forEach((entry) => {
    entry.label = applyInline(entry.label);
    entry.skills = applyInline(entry.skills);
  });

  normalized.achievements.forEach((entry) => {
    entry.text = applyInline(entry.text);
    if (typeof entry.githubLink === "string") {
      entry.githubLink = applyUrl(entry.githubLink);
    }
  });

  normalized.certificates.forEach((entry) => {
    entry.name = applyInline(entry.name);
    entry.description = applyInline(entry.description);
    entry.link = applyUrl(entry.link);
  });

  return { normalized, changedFields };
}
