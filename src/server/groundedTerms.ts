import type { ResumeData } from "../types/resume.js";

/**
 * Deterministic "tech-like term" extraction, used to catch tools a model
 * invents ("Jest", "React Testing Library", "Kubernetes") that the digit-only
 * guard cannot see. Deliberately conservative: a bullet that introduces a term
 * the resume never mentions is reverted, rather than letting an invented tool
 * through. Plain lowercase words are never terms, and the first word of a
 * sentence is not a term just because it is capitalised.
 */

const STOPWORDS = new Set([
  "i", "a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for",
  "with", "by", "from", "as", "is", "are", "was", "were", "we", "my", "our", "it",
  "its", "this", "that", "via", "per", "not", "all", "any", "ok", "eg", "ie", "etc",
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december", "jan", "feb", "mar", "apr",
  "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "present", "current", "currently", "using", "built", "key", "new",
]);

const SENTENCE_END = /[.!?:;]$/;
const BULLET_MARK = /^[•*\-–—·▪●○>]+$/;

/** Lowercase, drop dots/hyphens/underscores: "Node.js" and "NodeJS" compare equal. */
function canon(word: string): string {
  return word.toLowerCase().replace(/[.\-_]/g, "");
}

/** Edge-trim a raw whitespace token, keeping a leading ".NET" dot and trailing "+"/"#". */
function trimWord(raw: string): string {
  let w = raw.replace(/^[^A-Za-z0-9.]+/, "").replace(/[^A-Za-z0-9+#]+$/, "");
  if (w.startsWith(".") && !/^\.[A-Za-z]/.test(w)) w = w.slice(1);
  return w.replace(/'s$/i, "");
}

function isTechShaped(w: string): boolean {
  if (/[a-z][A-Z]/.test(w)) return true; // CamelCase: JavaScript, GitHub, iOS
  if (/[A-Za-z]/.test(w) && /\d/.test(w)) return true; // K8s, S3, 2M
  if (/[+#]$/.test(w)) return true; // C++, C#
  if (/^\.[A-Za-z]/.test(w)) return true; // .NET
  if (/[A-Za-z]\.[A-Za-z]/.test(w)) return true; // Node.js
  if (/^[A-Z]{2,}$/.test(w)) return true; // AWS, REST, SQL
  return false;
}

/**
 * Tech-like terms in `text`, lowercased. Capitalised words count unless they
 * start a sentence (or a bullet) or are ordinary words on the stopword list.
 */
export function termsIn(text: string): string[] {
  const out: string[] = [];
  let atStart = true;
  for (const raw of text.split(/\s+/)) {
    if (!raw) continue;
    if (BULLET_MARK.test(raw)) continue; // bullet glyphs keep the start flag
    const startOfSentence = atStart;
    atStart = SENTENCE_END.test(raw);

    // "CI/CD" and "Cross-Browser" are judged part by part.
    const pieces = raw.split(/[/\\|,()[\]{}]+|(?<=[A-Za-z])-(?=[A-Za-z])/);
    pieces.forEach((piece, idx) => {
      const w = trimWord(piece);
      if (w.length < 2 || !/[A-Za-z]/.test(w)) return;
      const lower = w.toLowerCase();
      if (STOPWORDS.has(lower)) return;
      const first = idx === 0 && startOfSentence;
      const capitalised = /^[A-Z]/.test(w);
      if (isTechShaped(w) || (capitalised && !first)) out.push(lower);
    });
  }
  return out;
}

/** Plain content text of a resume: no contact block, dates or education. */
export function resumeContentText(resume: ResumeData): string[] {
  const parts: string[] = [resume.summary || ""];
  for (const e of resume.experience || []) parts.push(...(e.bullets || []));
  for (const p of resume.projects || []) {
    parts.push(p.title || "", p.techStack || "", ...(p.bullets || []));
  }
  for (const s of resume.skills || []) parts.push(s.label || "", s.skills || "");
  for (const a of resume.achievements || []) parts.push(a.text || "");
  for (const c of resume.certificates || []) parts.push(c.name || "", c.description || "");
  for (const v of resume.volunteer || []) parts.push(...(v.bullets || []));
  return parts.filter(Boolean);
}

/** Every piece of resume text a term may legitimately come from. */
export function resumeTermSources(resume: ResumeData): string[] {
  const parts = resumeContentText(resume);
  for (const e of resume.experience || []) parts.push(e.company || "", e.role || "");
  for (const ed of resume.education || []) parts.push(ed.university || "", ed.degree || "");
  for (const v of resume.volunteer || []) parts.push(v.organization || "", v.role || "");
  return parts.filter(Boolean);
}

/** Word-level vocabulary of some texts, in the forms `isKnown` compares. */
export function knownTermsFromText(texts: string[]): Set<string> {
  const known = new Set<string>();
  const add = (word: string) => {
    const w = trimWord(word).toLowerCase();
    if (!w) return;
    known.add(w);
    const c = canon(w);
    known.add(c);
    if (c.endsWith("js") && c.length > 2) known.add(c.slice(0, -2));
  };
  for (const text of texts) {
    for (const raw of text.split(/\s+/)) {
      if (!raw) continue;
      add(raw);
      for (const piece of raw.split(/[/\\|,()[\]{}\-–—_]+/)) add(piece);
    }
  }
  return known;
}

/** Vocabulary of the original resume: any word anywhere grounds that word. */
export function knownTerms(original: ResumeData): Set<string> {
  return knownTermsFromText(resumeTermSources(original));
}

/** Is a (lowercased) term, or a close form of it, in the known vocabulary? */
export function isKnown(term: string, known: Set<string>): boolean {
  const c = canon(term);
  const stems = [term, c];
  for (const base of [term, c]) {
    if (base.endsWith("s") && base.length > 3) stems.push(base.slice(0, -1));
    if (base.endsWith("js") && base.length > 3) stems.push(base.slice(0, -2));
  }
  return stems.some((s) => known.has(s));
}

/** Terms in `text` that the known vocabulary does not cover. */
export function ungroundedTerms(text: string, known: Set<string>): string[] {
  return [...new Set(termsIn(text))].filter((t) => !isKnown(t, known));
}

/**
 * Is a skill / tech-stack item grounded? Items are usually lowercase or short
 * ("Postman", "testing"), so judge every word, not only tech-shaped ones.
 */
export function isItemGrounded(item: string, known: Set<string>): boolean {
  const trimmed = item.trim();
  if (!trimmed) return true;
  if (isKnown(trimmed.toLowerCase(), known)) return true;
  const words = trimmed
    .split(/[\s/&]+/)
    .map((w) => trimWord(w).toLowerCase())
    .filter((w) => w && !STOPWORDS.has(w));
  return words.length > 0 && words.every((w) => isKnown(w, known));
}

/** Rebuild a comma-separated list keeping only grounded items. */
export function filterGroundedList(list: string, known: Set<string>): string {
  return list
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && isItemGrounded(s, known))
    .join(", ");
}
