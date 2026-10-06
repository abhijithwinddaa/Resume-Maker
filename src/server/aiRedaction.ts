import type { ResumeData } from "../types/resume.js";

/**
 * Prompts that only need the resume's content — scoring, rewriting, keyword
 * placement, cover letters — get a copy with contact details removed.
 *
 * Free AI tiers may log or train on prompts, and none of those operations
 * needs the candidate's phone, email or profile links. The rewrite path
 * restores the real contact block and links from the original afterwards
 * (finalizeOptimizedResume / truthGuard), and the truth guard treats any
 * scrub placeholder the model echoes back as invented, so nothing is lost and
 * no placeholder reaches the user's resume.
 */

const EMAIL_PLACEHOLDER = "[email removed]";
const PHONE_PLACEHOLDER = "[phone removed]";
const LINK_PLACEHOLDER = "[link removed]";

/** Matches any placeholder this module writes. */
export const REDACTION_PLACEHOLDER = /\[(?:email|phone|link) removed\]/i;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s)>\]]+/gi;
const BARE_PROFILE_RE =
  /\b(?:linkedin\.com|github\.com|gitlab\.com)\/[^\s)>\]]+/gi;
// 7+ digits with optional +, spaces, dots, dashes, parentheses between them.
const PHONE_RE = /(?<![\w.])\+?\(?\d[\d\s().-]{5,}\d(?![\w])/g;

/** Remove emails, URLs and phone numbers from free text. */
export function scrubContactText(text: string): string {
  if (!text) return text;
  return text
    .replace(EMAIL_RE, EMAIL_PLACEHOLDER)
    .replace(URL_RE, LINK_PLACEHOLDER)
    .replace(BARE_PROFILE_RE, LINK_PLACEHOLDER)
    .replace(PHONE_RE, (m) => {
      const digits = (m.match(/\d/g) || []).length;
      // Year ranges ("2018-2021") are not phone numbers.
      const phoneLike = digits >= 10 || (digits >= 8 && /^[+(]/.test(m));
      return phoneLike ? PHONE_PLACEHOLDER : m;
    });
}

/**
 * A copy of the resume with the contact block and every link blanked and
 * emails/phones/URLs scrubbed from free text. Pass `keepName` when the output
 * is prose that must sign off with the candidate's name (cover letters).
 */
export function redactContactForAI(
  resume: ResumeData,
  options: { keepName?: boolean } = {},
): ResumeData {
  return {
    ...resume,
    contact: {
      name: options.keepName ? resume.contact?.name || "" : "",
      phone: "",
      email: "",
      linkedin: "",
      github: "",
      portfolio: "",
    },
    summary: scrubContactText(resume.summary || ""),
    experience: (resume.experience || []).map((e) => ({
      ...e,
      bullets: (e.bullets || []).map(scrubContactText),
    })),
    projects: (resume.projects || []).map((p) => ({
      ...p,
      githubLink: "",
      liveLink: "",
      bullets: (p.bullets || []).map(scrubContactText),
    })),
    achievements: (resume.achievements || []).map((a) => ({
      ...a,
      text: scrubContactText(a.text || ""),
      ...(a.githubLink !== undefined && { githubLink: "" }),
    })),
    certificates: (resume.certificates || []).map((c) => ({
      ...c,
      description: scrubContactText(c.description || ""),
      link: "",
    })),
  };
}
