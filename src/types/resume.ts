export interface ResumeMeta {
  template: string;
  createdAt: number;
  lastModified: number;
  entryPath: "A" | "B" | "C";
}

export interface VolunteerEntry {
  organization: string;
  role: string;
  dateRange: string;
  bullets: string[];
}

export interface ContactInfo {
  name: string;
  phone: string;
  email: string;
  linkedin: string;
  github: string;
  portfolio: string;
}

export interface Education {
  id?: string;
  university: string;
  location: string;
  degree: string;
  yearRange: string;
  cgpa: string;
}

export interface Experience {
  id?: string;
  company: string;
  role: string;
  location: string;
  dateRange: string;
  bullets: string[];
}

export interface Project {
  id?: string;
  title: string;
  githubLink: string;
  liveLink: string;
  techStack: string;
  bullets: string[];
}

export interface SkillCategory {
  id?: string;
  label: string;
  skills: string;
}

export interface Achievement {
  text: string;
  githubLink?: string;
}

export interface Certificate {
  name: string;
  description: string;
  link: string;
}

export type SectionKey =
  | "summary"
  | "education"
  | "experience"
  | "projects"
  | "skills"
  | "achievements"
  | "certificates";

export const DEFAULT_SECTION_ORDER: SectionKey[] = [
  "summary",
  "education",
  "experience",
  "projects",
  "skills",
  "achievements",
  "certificates",
];

export const DEFAULT_SECTION_LABELS: Record<SectionKey, string> = {
  summary: "Summary",
  education: "Education",
  experience: "Experience",
  projects: "Projects",
  skills: "Skills",
  achievements: "Achievements",
  certificates: "Certificates",
};

export interface ResumeData {
  contact: ContactInfo;
  summary: string;
  education: Education[];
  experience: Experience[];
  showExperience: boolean;
  projects: Project[];
  skills: SkillCategory[];
  achievements: Achievement[];
  certificates: Certificate[];
  showCertificates: boolean;
  sectionOrder: SectionKey[];
  sectionLabels?: Partial<Record<SectionKey, string>>;
  meta?: ResumeMeta;
  volunteer?: VolunteerEntry[];
}

export function createEmptyResume(): ResumeData {
  return {
    contact: {
      name: "",
      phone: "",
      email: "",
      linkedin: "",
      github: "",
      portfolio: "",
    },
    summary: "",
    education: [
      { id: "edu-1", university: "", location: "", degree: "", yearRange: "", cgpa: "" },
    ],
    experience: [
      { id: "exp-1", company: "", role: "", location: "", dateRange: "", bullets: [""] },
    ],
    showExperience: true,
    projects: [
      { id: "proj-1", title: "", githubLink: "", liveLink: "", techStack: "", bullets: [""] },
    ],
    skills: [{ id: "skill-1", label: "", skills: "" }],
    achievements: [{ text: "" }],
    certificates: [{ name: "", description: "", link: "" }],
    showCertificates: true,
    sectionOrder: [...DEFAULT_SECTION_ORDER],
  };
}

export interface JDAnalysis {
  allKeywords: string[];
  matchedKeywords: string[];
  missingKeywords: string[];
  matchPercentage: number;
}
