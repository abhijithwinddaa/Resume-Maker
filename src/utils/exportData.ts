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
import { safeUrl } from "./safeUrl";

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const has = (value: unknown): boolean => str(value).trim().length > 0;
const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const bulletsOf = (value: unknown): string[] =>
  list<unknown>(value).filter((b): b is string => typeof b === "string" && b.trim().length > 0);

/**
 * The resume as it should appear on paper: blank starter entries and blank
 * bullets are dropped, links are made safe, and sections that end up with no
 * content are emptied so no heading is printed for them. Order, labels and
 * visibility flags are kept. Never mutates the input.
 */
export function pruneForExport(data: ResumeData): ResumeData {
  const contact: ContactInfo = {
    name: str(data?.contact?.name),
    phone: str(data?.contact?.phone),
    email: str(data?.contact?.email),
    linkedin: safeUrl(data?.contact?.linkedin),
    github: safeUrl(data?.contact?.github),
    portfolio: safeUrl(data?.contact?.portfolio),
  };

  const education = list<Education>(data?.education)
    .filter((e) => has(e?.university) || has(e?.degree) || has(e?.yearRange) || has(e?.cgpa))
    .map((e) => ({ ...e, university: str(e.university), location: str(e.location), degree: str(e.degree), yearRange: str(e.yearRange), cgpa: str(e.cgpa) }));

  const showExperience = data?.showExperience !== false;
  const experience = showExperience
    ? list<Experience>(data?.experience)
        .map((e) => ({
          ...e,
          company: str(e?.company),
          role: str(e?.role),
          location: str(e?.location),
          dateRange: str(e?.dateRange),
          bullets: bulletsOf(e?.bullets),
        }))
        .filter(
          (e) => has(e.company) || has(e.role) || has(e.dateRange) || has(e.location) || e.bullets.length > 0,
        )
    : [];

  const projects = list<Project>(data?.projects)
    .map((p) => ({
      ...p,
      title: str(p?.title),
      techStack: str(p?.techStack),
      githubLink: safeUrl(p?.githubLink),
      liveLink: safeUrl(p?.liveLink),
      bullets: bulletsOf(p?.bullets),
    }))
    .filter((p) => has(p.title) || has(p.techStack) || p.githubLink || p.liveLink || p.bullets.length > 0);

  const skills = list<SkillCategory>(data?.skills)
    .filter((s) => has(s?.label) || has(s?.skills))
    .map((s) => ({ ...s, label: str(s.label), skills: str(s.skills) }));

  const achievements = list<Achievement>(data?.achievements)
    .filter((a) => has(a?.text))
    .map((a) => ({ ...a, text: str(a.text), githubLink: safeUrl(a.githubLink) }));

  const showCertificates = data?.showCertificates !== false;
  const certificates = showCertificates
    ? list<Certificate>(data?.certificates)
        .map((c) => ({
          ...c,
          name: str(c?.name),
          description: str(c?.description),
          link: safeUrl(c?.link),
        }))
        .filter((c) => has(c.name) || has(c.description) || c.link)
    : [];

  return {
    ...data,
    contact,
    summary: has(data?.summary) ? str(data.summary) : "",
    education,
    experience,
    showExperience,
    projects,
    skills,
    achievements,
    certificates,
    showCertificates,
    sectionOrder:
      Array.isArray(data?.sectionOrder) && data.sectionOrder.length > 0
        ? data.sectionOrder
        : [...DEFAULT_SECTION_ORDER],
  };
}

/** Whether a section of an already-pruned resume has anything to print. */
export function sectionHasContent(data: ResumeData, key: SectionKey): boolean {
  switch (key) {
    case "summary":
      return has(data.summary);
    case "education":
      return data.education.length > 0;
    case "experience":
      return data.showExperience && data.experience.length > 0;
    case "projects":
      return data.projects.length > 0;
    case "skills":
      return data.skills.length > 0;
    case "achievements":
      return data.achievements.length > 0;
    case "certificates":
      return data.showCertificates && data.certificates.length > 0;
    default:
      return false;
  }
}
