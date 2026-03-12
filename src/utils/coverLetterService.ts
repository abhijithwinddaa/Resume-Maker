import type { AISettings } from "../types/aiSettings";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CoverLetterParams {
  aiSettings: AISettings;
  resumeText: string;
  jobDescription: string;
  companyName: string;
  position: string;
}

export async function generateCoverLetter(
  params: CoverLetterParams,
  signal?: AbortSignal,
): Promise<string> {
  const { aiSettings, resumeText, jobDescription, companyName, position } =
    params;

  const prompt = `You are an expert career coach. Write a professional cover letter based on the candidate's resume and the job description.

CANDIDATE RESUME:
${resumeText}

JOB DESCRIPTION:
${jobDescription}

COMPANY: ${companyName}
POSITION: ${position}

INSTRUCTIONS:
- Write a compelling, personalized cover letter (3-4 paragraphs)
- Highlight relevant skills and experience from the resume that match the job description
- Show enthusiasm for the company and role
- Use a professional but warm tone
- Do NOT include placeholder text like [Your Name] — use the actual name from the resume
- Do NOT include addresses or date headers — just the letter body
- Keep it under 400 words

Return ONLY the cover letter text, no JSON, no markdown formatting.`;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: "You are a professional career coach and cover letter writer.",
    },
    { role: "user", content: prompt },
  ];

  const { callAI } = await import("./aiService");
  const response = await callAI(aiSettings, messages, signal);
  return response.trim();
}
