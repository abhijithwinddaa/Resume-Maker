import { loadPrivacySettings } from "../types/privacySettings";
import { postServerAIRequest } from "./aiService";
import type {
  GenerateCoverLetterRequest,
  GenerateCoverLetterResponse,
} from "../types/serverAI";

interface CoverLetterParams {
  resumeText: string;
  jobDescription: string;
  companyName: string;
  position: string;
}

export async function generateCoverLetter(
  params: CoverLetterParams,
  signal?: AbortSignal,
): Promise<string> {
  const { resumeText, jobDescription, companyName, position } = params;
  const cacheAllowed = loadPrivacySettings().cacheAIResponses;

  const response = await postServerAIRequest<
    GenerateCoverLetterRequest,
    GenerateCoverLetterResponse
  >(
    "/api/generate/cover-letter",
    {
      resumeText,
      jobDescription,
      companyName,
      position,
      cacheAllowed,
    },
    signal,
  );

  return response.content.trim();
}
