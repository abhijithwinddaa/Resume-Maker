export interface ContactInfo {
  name: string;
  phone: string;
  email: string;
  linkedin: string;
  github: string;
  portfolio: string;
}

export interface Education {
  university: string;
  location: string;
  degree: string;
  yearRange: string;
  cgpa: string;
}

export interface Experience {
  company: string;
  role: string;
  location: string;
  dateRange: string;
  bullets: string[];
}

export interface Project {
  title: string;
  githubLink: string;
  liveLink: string;
  techStack: string;
  bullets: string[];
}

export interface SkillCategory {
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
      { university: "", location: "", degree: "", yearRange: "", cgpa: "" },
    ],
    experience: [
      { company: "", role: "", location: "", dateRange: "", bullets: [""] },
    ],
    showExperience: true,
    projects: [
      { title: "", githubLink: "", liveLink: "", techStack: "", bullets: [""] },
    ],
    skills: [{ label: "", skills: "" }],
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
