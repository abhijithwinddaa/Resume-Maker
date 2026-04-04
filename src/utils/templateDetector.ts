/**
 * Detects the visual template style of an uploaded resume using AI.
 *
 * Runs in parallel with resume parsing so it doesn't add latency.
 */
import type { TemplateId, TemplateCustomization } from "../types/templates";
import { DEFAULT_CUSTOMIZATION } from "../types/templates";
import { loadPrivacySettings } from "../types/privacySettings";
import { postServerAIRequest } from "./aiService";
import type {
  DetectTemplateRequest,
  DetectTemplateResponse,
} from "../types/serverAI";

export interface DetectedStyle {
  templateId: TemplateId;
  customization: TemplateCustomization;
  confidence: number;
  styleName: string;
}

/**
 * Detect the template style from resume text using AI.
 * Returns a sanitized DetectedStyle object with fallbacks for every field.
 */
export async function detectTemplateStyle(
  resumeText: string,
  signal?: AbortSignal,
): Promise<DetectedStyle> {
  const cacheAllowed = loadPrivacySettings().cacheAIResponses;

  try {
    const response = await postServerAIRequest<
      DetectTemplateRequest,
      DetectTemplateResponse
    >(
      "/api/detect/template",
      {
        resumeText,
        cacheAllowed,
      },
      signal,
    );

    return response.detectedStyle;
  } catch (error) {
    console.warn("Template style detection failed, using defaults:", error);
    return {
      templateId: "classic",
      customization: { ...DEFAULT_CUSTOMIZATION },
      confidence: 0,
      styleName: "Default Classic",
    };
  }
}
