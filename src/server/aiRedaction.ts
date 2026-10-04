import type { ResumeData } from "../types/resume.js";

/**
 * A copy of the resume with the contact block blanked, for prompts that only
 * need the content — scoring, rewriting, keyword placement.
 *
 * Free AI tiers may log or train on prompts, and none of those operations
 * reads the candidate's name, phone, email or profile links. The rewrite path
 * restores the real contact block from the original afterwards
 * (finalizeOptimizedResume), so nothing is lost.
 */
export function redactContactForAI(resume: ResumeData): ResumeData {
  return {
    ...resume,
    contact: {
      name: "",
      phone: "",
      email: "",
      linkedin: "",
      github: "",
      portfolio: "",
    },
  };
}
