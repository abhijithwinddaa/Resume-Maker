/* ─── normalizeResumeData ─────────────────────────────
   Turns ANY untrusted value (embedded PDF JSON, backup,
   AI output, imported file, DB row) into a structurally
   valid ResumeData so render/validate/export never crash.
   ────────────────────────────────────────────────────── */

import type {
  Achievement,
  Certificate,
  ContactInfo,
  Education,
  Experience,
  Project,
  ResumeData,
  SectionKey,
  SkillCategory,
} from "../types/resume";
import { DEFAULT_SECTION_ORDER } from "../types/resume";

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return fallback;
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function objArray(v: unknown): Obj[] {
  return Array.isArray(v) ? v.filter(isObj) : [];
}

/**
 * Link fields accept http(s) URLs, scheme-less hosts ("linkedin.com/in/x") and
 * empty strings. Any other scheme (javascript:, data:, vbscript:, ...) is unsafe
 * to put in an href.
 */
export function isSafeLink(value: string): boolean {
  const v = value.trim();
  if (v === "") return true;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(v)) return false;
  if (/^https?:\/\//i.test(v)) return true;
  // "host:3000/path" looks like a scheme but is a port.
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(v)) return false;
  return true;
}

function link(v: unknown): string {
  const s = str(v);
  return isSafeLink(s) ? s : "";
}

let idCounter = 0;
export function newId(prefix = "id"): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function idOf(o: Obj, prefix: string): string {
  return typeof o.id === "string" && o.id ? o.id : newId(prefix);
}

const VALID_KEYS = new Set<string>(DEFAULT_SECTION_ORDER);

function normalizeOrder(v: unknown): SectionKey[] {
  if (!Array.isArray(v)) return [...DEFAULT_SECTION_ORDER];
  const out: SectionKey[] = [];
  for (const k of v) {
    if (typeof k === "string" && VALID_KEYS.has(k) && !out.includes(k as SectionKey)) {
      out.push(k as SectionKey);
    }
  }
  // Keep every section reachable even if the stored order omitted one.
  for (const k of DEFAULT_SECTION_ORDER) if (!out.includes(k)) out.push(k);
  return out;
}

export function normalizeResumeData(raw: unknown): ResumeData {
  const r: Obj = isObj(raw) ? raw : {};
  const c: Obj = isObj(r.contact) ? r.contact : {};

  const contact: ContactInfo = {
    name: str(c.name),
    phone: str(c.phone),
    email: str(c.email),
    linkedin: link(c.linkedin),
    github: link(c.github),
    portfolio: link(c.portfolio),
  };

  const education: Education[] = objArray(r.education).map((e) => ({
    id: idOf(e, "edu"),
    university: str(e.university),
    location: str(e.location),
    degree: str(e.degree),
    yearRange: str(e.yearRange),
    cgpa: str(e.cgpa),
  }));

  const experience: Experience[] = objArray(r.experience).map((e) => ({
    id: idOf(e, "exp"),
    company: str(e.company),
    role: str(e.role),
    location: str(e.location),
    dateRange: str(e.dateRange),
    bullets: strArray(e.bullets),
  }));

  const projects: Project[] = objArray(r.projects).map((p) => ({
    id: idOf(p, "proj"),
    title: str(p.title),
    githubLink: link(p.githubLink),
    liveLink: link(p.liveLink),
    techStack: str(p.techStack),
    bullets: strArray(p.bullets),
  }));

  const skills: SkillCategory[] = objArray(r.skills).map((s) => ({
    id: idOf(s, "skill"),
    label: str(s.label),
    skills: Array.isArray(s.skills) ? strArray(s.skills).join(", ") : str(s.skills),
  }));

  const achievements: Achievement[] = (Array.isArray(r.achievements) ? r.achievements : [])
    .map((a): Achievement | null => {
      if (typeof a === "string") return { text: a };
      if (!isObj(a)) return null;
      const out: Achievement = { text: str(a.text) };
      if (typeof a.githubLink === "string") out.githubLink = link(a.githubLink);
      return out;
    })
    .filter((a): a is Achievement => a !== null);

  const certificates: Certificate[] = objArray(r.certificates).map((x) => ({
    name: str(x.name),
    description: str(x.description),
    link: link(x.link),
  }));

  const out: ResumeData = {
    contact,
    summary: str(r.summary),
    education,
    experience,
    showExperience:
      typeof r.showExperience === "boolean" ? r.showExperience : experience.length > 0,
    projects,
    skills,
    achievements,
    certificates,
    showCertificates:
      typeof r.showCertificates === "boolean" ? r.showCertificates : certificates.length > 0,
    sectionOrder: normalizeOrder(r.sectionOrder),
  };

  if (isObj(r.sectionLabels)) {
    const labels: Partial<Record<SectionKey, string>> = {};
    for (const k of DEFAULT_SECTION_ORDER) {
      const v = (r.sectionLabels as Obj)[k];
      if (typeof v === "string") labels[k] = v;
    }
    out.sectionLabels = labels;
  }

  if (isObj(r.meta)) {
    const m = r.meta;
    const path = m.entryPath === "A" || m.entryPath === "B" || m.entryPath === "C" ? m.entryPath : "C";
    out.meta = {
      template: str(m.template, "classic"),
      createdAt: typeof m.createdAt === "number" ? m.createdAt : 0,
      lastModified: typeof m.lastModified === "number" ? m.lastModified : 0,
      entryPath: path,
    };
  }

  if (Array.isArray(r.volunteer)) {
    out.volunteer = objArray(r.volunteer).map((v) => ({
      organization: str(v.organization),
      role: str(v.role),
      dateRange: str(v.dateRange),
      bullets: strArray(v.bullets),
    }));
  }

  return out;
}
