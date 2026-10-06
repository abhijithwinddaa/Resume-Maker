import { z } from "zod";
import { isSafeLink } from "./normalizeResume";

// Generous limits: this schema validates the app's OWN export, which can hold
// empty starter entries and long bullets. It guards shape and unsafe URLs, not
// content quality.
const text = (max: number) => z.string().max(max);

/** Empty, http(s), or scheme-less ("linkedin.com/in/x"); never javascript:. */
const linkField = z
  .string()
  .max(2000)
  .refine(isSafeLink, "Links must be http(s) URLs");

const bullets = z.array(z.string().max(5000)).max(100);

// Contact validation
export const contactSchema = z.object({
  name: text(200),
  phone: text(60),
  email: z.string().max(320).email("Invalid email").or(z.literal("")),
  linkedin: linkField,
  github: linkField,
  portfolio: linkField,
});

export const educationSchema = z.object({
  id: z.string().optional(),
  university: text(300),
  location: text(200),
  degree: text(300),
  yearRange: text(100),
  cgpa: text(60),
});

export const experienceSchema = z.object({
  id: z.string().optional(),
  company: text(300),
  role: text(300),
  location: text(200),
  dateRange: text(100),
  bullets,
});

export const projectSchema = z.object({
  id: z.string().optional(),
  title: text(300),
  githubLink: linkField,
  liveLink: linkField,
  techStack: text(1000),
  bullets,
});

export const skillCategorySchema = z.object({
  id: z.string().optional(),
  label: text(200),
  skills: text(2000),
});

export const achievementSchema = z.object({
  text: text(2000),
  githubLink: linkField.optional(),
});

export const certificateSchema = z.object({
  name: text(300),
  description: text(2000),
  link: linkField,
});

export const sectionKeySchema = z.enum([
  "summary",
  "education",
  "experience",
  "projects",
  "skills",
  "achievements",
  "certificates",
]);

export const resumeDataSchema = z.object({
  contact: contactSchema,
  summary: text(10000),
  education: z.array(educationSchema).max(50),
  experience: z.array(experienceSchema).max(50),
  showExperience: z.boolean(),
  projects: z.array(projectSchema).max(50),
  skills: z.array(skillCategorySchema).max(50),
  achievements: z.array(achievementSchema).max(100),
  certificates: z.array(certificateSchema).max(100),
  showCertificates: z.boolean(),
  sectionOrder: z.array(sectionKeySchema),
  sectionLabels: z.record(z.string(), z.string()).optional(),
  meta: z
    .object({
      template: z.string().optional(),
      createdAt: z.number().optional(),
      lastModified: z.number().optional(),
      entryPath: z.string().optional(),
    })
    .optional(),
  volunteer: z
    .array(
      z.object({
        organization: text(300),
        role: text(300),
        dateRange: text(100),
        bullets,
      }),
    )
    .optional(),
});

export function validateResumeData(data: unknown) {
  const result = resumeDataSchema.safeParse(data);
  if (result.success) {
    return { valid: true as const, data: result.data };
  }
  return {
    valid: false as const,
    errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}
