/**
 * Detects the visual template style of an uploaded resume using AI.
 *
 * Runs in parallel with resume parsing so it doesn't add latency.
 */
import type { AISettings } from "../types/aiSettings";
import type { TemplateId, TemplateCustomization } from "../types/templates";
import { DEFAULT_CUSTOMIZATION, FONT_OPTIONS } from "../types/templates";
import { callAI } from "./aiService";
import { buildTemplateDetectorPrompt } from "./templateDetectorPrompt";

export interface DetectedStyle {
  templateId: TemplateId;
  customization: TemplateCustomization;
  confidence: number;
  styleName: string;
}

interface DetectorRawResponse {
  templateId?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  fontSize?: string;
  lineHeight?: string;
  sectionSpacing?: string;
  confidence?: number;
  styleName?: string;
}

const VALID_TEMPLATE_IDS: TemplateId[] = [
  "classic",
  "modern",
  "minimal",
  "creative",
  "ats",
];
const VALID_FONT_IDS = FONT_OPTIONS.map((f) => f.id);
const VALID_FONT_SIZES = ["small", "medium", "large"] as const;
const VALID_LINE_HEIGHTS = ["compact", "normal", "relaxed"] as const;
const VALID_SPACINGS = ["tight", "normal", "spacious"] as const;

function isValidHex(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color);
}

/**
 * Detect the template style from resume text using AI.
 * Returns a sanitized DetectedStyle object with fallbacks for every field.
 */
export async function detectTemplateStyle(
  settings: AISettings,
  resumeText: string,
): Promise<DetectedStyle> {
  const prompt = buildTemplateDetectorPrompt(resumeText);

  const messages: { role: "system" | "user"; content: string }[] = [
    {
      role: "system",
      content:
        "You are a resume design analyst. Output ONLY valid JSON. No markdown, no explanation, no code fences.",
    },
    { role: "user", content: prompt },
  ];

  try {
    const rawResponse = await callAI(settings, messages);
    const jsonStr = extractJSON(rawResponse);
    const parsed: DetectorRawResponse = JSON.parse(jsonStr);

    return sanitizeDetectedStyle(parsed);
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

/**
 * Sanitize and validate the raw AI response into a safe DetectedStyle.
 */
function sanitizeDetectedStyle(raw: DetectorRawResponse): DetectedStyle {
  const templateId: TemplateId = VALID_TEMPLATE_IDS.includes(
    raw.templateId as TemplateId,
  )
    ? (raw.templateId as TemplateId)
    : "classic";

  const primaryColor =
    raw.primaryColor && isValidHex(raw.primaryColor)
      ? raw.primaryColor
      : DEFAULT_CUSTOMIZATION.primaryColor;

  const secondaryColor =
    raw.secondaryColor && isValidHex(raw.secondaryColor)
      ? raw.secondaryColor
      : DEFAULT_CUSTOMIZATION.secondaryColor;

  const fontFamily = VALID_FONT_IDS.includes(raw.fontFamily || "")
    ? raw.fontFamily!
    : DEFAULT_CUSTOMIZATION.fontFamily;

  const fontSize = (VALID_FONT_SIZES as readonly string[]).includes(
    raw.fontSize || "",
  )
    ? (raw.fontSize as TemplateCustomization["fontSize"])
    : DEFAULT_CUSTOMIZATION.fontSize;

  const lineHeight = (VALID_LINE_HEIGHTS as readonly string[]).includes(
    raw.lineHeight || "",
  )
    ? (raw.lineHeight as TemplateCustomization["lineHeight"])
    : DEFAULT_CUSTOMIZATION.lineHeight;

  const sectionSpacing = (VALID_SPACINGS as readonly string[]).includes(
    raw.sectionSpacing || "",
  )
    ? (raw.sectionSpacing as TemplateCustomization["sectionSpacing"])
    : DEFAULT_CUSTOMIZATION.sectionSpacing;

  const confidence =
    typeof raw.confidence === "number"
      ? Math.max(0, Math.min(100, Math.round(raw.confidence)))
      : 50;

  const styleName =
    typeof raw.styleName === "string" && raw.styleName.trim()
      ? raw.styleName.trim()
      : `${templateId.charAt(0).toUpperCase() + templateId.slice(1)} Style`;

  return {
    templateId,
    customization: {
      primaryColor,
      secondaryColor,
      fontFamily,
      fontSize,
      lineHeight,
      sectionSpacing,
    },
    confidence,
    styleName,
  };
}

/**
 * Extract JSON from a possibly messy AI response.
 */
function extractJSON(text: string): string {
  const trimmed = text.trim();

  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // ignore
  }

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.substring(firstBrace, lastBrace + 1);
  }

  return trimmed;
}
