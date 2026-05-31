import type { ResumeData } from "../types/resume";

export type ExperienceTier = "fresher" | "experienced";

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function parseDateToken(rawToken: string): Date | null {
  const token = rawToken.trim().toLowerCase();
  if (!token) return null;
  if (/present|current|now/.test(token)) {
    return new Date();
  }

  const monthMatch = token.match(
    /(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)/,
  );
  const yearMatch = token.match(/(19|20)\d{2}/);

  if (yearMatch) {
    const year = Number(yearMatch[0]);
    const month = monthMatch ? (MONTH_INDEX[monthMatch[0]] ?? 0) : 6;
    return new Date(year, month, 1);
  }

  const parsed = new Date(rawToken);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

export function estimateExperienceMonths(resumeData: ResumeData | null): number {
  if (!resumeData) return 0;

  let totalMonths = 0;
  const meaningfulEntries = resumeData.experience.filter(
    (entry) =>
      entry.company.trim() ||
      entry.role.trim() ||
      entry.dateRange.trim() ||
      entry.bullets.some((bullet) => bullet.trim()),
  );

  for (const entry of meaningfulEntries) {
    const dateRange = entry.dateRange.trim();
    if (!dateRange) continue;

    const [startRaw, endRaw] = dateRange
      .split(/\s*(?:-|–|to)\s*/i)
      .filter(Boolean);
    const start = parseDateToken(startRaw || "");
    const end = parseDateToken(endRaw || "present");

    if (!start || !end) continue;

    const startIndex = start.getFullYear() * 12 + start.getMonth();
    const endIndex = end.getFullYear() * 12 + end.getMonth();
    if (endIndex >= startIndex) {
      totalMonths += endIndex - startIndex + 1;
    }
  }

  if (totalMonths > 0) return totalMonths;

  // Conservative fallback when date parsing fails but experience exists.
  return meaningfulEntries.length >= 2
    ? 24
    : meaningfulEntries.length === 1
      ? 12
      : 0;
}

export function getExperienceTier(resumeData: ResumeData | null): ExperienceTier {
  const months = estimateExperienceMonths(resumeData);
  return months < 18 ? "fresher" : "experienced";
}
