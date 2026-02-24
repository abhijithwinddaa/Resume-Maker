import { z } from "zod";

// Contact validation
export const contactSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  phone: z.string().max(30),
  email: z.string().email("Invalid email").or(z.literal("")),
  linkedin: z.string().url("Invalid URL").or(z.literal("")),
  github: z.string().url("Invalid URL").or(z.literal("")),
  portfolio: z.string().url("Invalid URL").or(z.literal("")),
});

export const educationSchema = z.object({
  university: z.string().min(1).max(200),
  location: z.string().max(100),
  degree: z.string().min(1).max(200),
  yearRange: z.string().max(50),
  cgpa: z.string().max(30),
});

export const experienceSchema = z.object({
  company: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
  location: z.string().max(100),
  dateRange: z.string().max(50),
  bullets: z.array(z.string().max(500)).max(10),
});

export const projectSchema = z.object({
  title: z.string().min(1).max(200),
  githubLink: z.string().url().or(z.literal("")),
  liveLink: z.string().url().or(z.literal("")),
  techStack: z.string().max(300),
  bullets: z.array(z.string().max(500)).max(10),
});

export const skillCategorySchema = z.object({
  label: z.string().min(1).max(100),
  skills: z.string().max(500),
});

export const achievementSchema = z.object({
  text: z.string().min(1).max(500),
  githubLink: z.string().url().or(z.literal("")).optional(),
});

export const certificateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500),
  link: z.string().url().or(z.literal("")),
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
  summary: z.string().max(2000),
  education: z.array(educationSchema).max(10),
  experience: z.array(experienceSchema).max(20),
  showExperience: z.boolean(),
  projects: z.array(projectSchema).max(20),
  skills: z.array(skillCategorySchema).max(15),
  achievements: z.array(achievementSchema).max(20),
  certificates: z.array(certificateSchema).max(20),
  showCertificates: z.boolean(),
  sectionOrder: z.array(sectionKeySchema),
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
