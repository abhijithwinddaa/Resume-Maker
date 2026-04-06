import { buildTemplateDetectorPrompt } from "../../src/utils/templateDetectorPrompt.js";
import {
  buildTemplateDetectCacheKey,
  readServerCache,
  withInFlightDedup,
  writeServerCache,
} from "../../src/server/aiCacheStore.js";
import { callServerAI } from "../../src/server/aiRuntime.js";
import { authenticateClerkRequest } from "../../src/server/requestAuth.js";
import { isRequestTooLarge } from "../../src/server/requestUtils.js";
import {
  isNodeResponse,
  sendNodeResponse,
  toWebRequest,
} from "../../src/server/httpAdapter.js";
import {
  DEFAULT_CUSTOMIZATION,
  FONT_OPTIONS,
} from "../../src/types/templates.js";
import type {
  DetectTemplateRequest,
  DetectTemplateResponse,
} from "../../src/types/serverAI.js";
import type {
  TemplateCustomization,
  TemplateId,
} from "../../src/types/templates.js";
import type { DetectedStyle } from "../../src/utils/templateDetector.js";

const MAX_REQUEST_BYTES = 256_000;
const MIN_RESUME_TEXT_LENGTH = 100;
const MAX_RESUME_TEXT_LENGTH = 50_000;

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
  "portfolio",
];
const VALID_FONT_IDS = FONT_OPTIONS.map((font) => font.id);
const VALID_FONT_SIZES = ["small", "medium", "large"] as const;
const VALID_LINE_HEIGHTS = ["compact", "normal", "relaxed"] as const;
const VALID_SPACINGS = ["tight", "normal", "spacious"] as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function validateRequest(body: Partial<DetectTemplateRequest>): string | null {
  if (typeof body.resumeText !== "string") {
    return "resumeText is required.";
  }

  const resumeText = body.resumeText.trim();
  if (resumeText.length < MIN_RESUME_TEXT_LENGTH) {
    return `resumeText must be at least ${MIN_RESUME_TEXT_LENGTH} characters.`;
  }
  if (resumeText.length > MAX_RESUME_TEXT_LENGTH) {
    return `resumeText exceeds ${MAX_RESUME_TEXT_LENGTH} characters.`;
  }

  return null;
}

function isValidHex(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color);
}

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

function getFallbackStyle(): DetectedStyle {
  return {
    templateId: "classic",
    customization: { ...DEFAULT_CUSTOMIZATION },
    confidence: 0,
    styleName: "Default Classic",
  };
}

async function handleRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  if (isRequestTooLarge(request, MAX_REQUEST_BYTES)) {
    return jsonResponse(
      { error: "Request body too large. Please reduce input size." },
      413,
    );
  }

  const authResult = await authenticateClerkRequest(request);
  if (!authResult.ok) {
    return jsonResponse({ error: authResult.message }, authResult.status);
  }

  let body: DetectTemplateRequest;
  try {
    body = (await request.json()) as DetectTemplateRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON request body." }, 400);
  }

  const validationError = validateRequest(body);
  if (validationError) {
    return jsonResponse({ error: validationError }, 400);
  }

  const resumeText = body.resumeText.trim();
  const cacheAllowed = body.cacheAllowed;
  const operation = "template-detect";
  const cacheKey = buildTemplateDetectCacheKey(resumeText);

  try {
    const detectedStyle = await withInFlightDedup<DetectedStyle>(
      cacheKey,
      async () => {
        if (cacheAllowed) {
          const cached = await readServerCache<DetectedStyle>(cacheKey);
          if (cached) {
            return sanitizeDetectedStyle(cached);
          }
        }

        const prompt = buildTemplateDetectorPrompt(resumeText);
        const rawResponse = await callServerAI(
          [
            {
              role: "system",
              content:
                "You are a resume design analyst. Output ONLY valid JSON. No markdown, no explanation, no code fences.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          request.signal,
        );

        const parsed = sanitizeDetectedStyle(
          JSON.parse(extractJSON(rawResponse)) as DetectorRawResponse,
        );

        if (cacheAllowed) {
          await writeServerCache(operation, cacheKey, parsed);
        }

        return parsed;
      },
    );

    const response: DetectTemplateResponse = {
      detectedStyle,
      cached: cacheAllowed,
    };

    return jsonResponse(response);
  } catch {
    const response: DetectTemplateResponse = {
      detectedStyle: getFallbackStyle(),
      cached: false,
    };
    return jsonResponse(response);
  }
}

export default async function handler(
  requestOrNodeReq: Request | Record<string, unknown>,
  maybeNodeRes?: unknown,
): Promise<Response | void> {
  const request = toWebRequest(requestOrNodeReq);
  const response = await handleRequest(request);

  if (isNodeResponse(maybeNodeRes)) {
    await sendNodeResponse(maybeNodeRes, response);
    return;
  }

  return response;
}
