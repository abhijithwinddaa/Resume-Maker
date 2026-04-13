import { buildResumeParsePrompt } from "../../src/utils/resumeParser.js";
import { extractJSON } from "../../src/server/aiParsing.js";
import {
  buildParseCacheKey,
  readServerCache,
  withInFlightDedup,
  writeServerCache,
} from "../../src/server/aiCacheStore.js";
import { callServerAI } from "../../src/server/aiRuntime.js";
import { authenticateClerkRequest } from "../../src/server/requestAuth.js";
import {
  DEFAULT_SECTION_ORDER,
  type ResumeData,
} from "../../src/types/resume.js";
import {
  normalizeExtractedResumeText,
  normalizeResumeDataSpacing,
} from "../../src/utils/resumeTextCleanup.js";
import type {
  ParseResumeRequest,
  ParseResumeResponse,
} from "../../src/types/serverAI.js";
import { isRequestTooLarge } from "../../src/server/requestUtils.js";
import {
  isNodeResponse,
  sendNodeResponse,
  toWebRequest,
} from "../../src/server/httpAdapter.js";

const MAX_REQUEST_BYTES = 512_000;
const MIN_RESUME_TEXT_LENGTH = 100;
const MAX_RESUME_TEXT_LENGTH = 50_000;
const MAX_LINK_COUNT = 200;
const MAX_LINK_LENGTH = 2_048;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function validateRequest(body: Partial<ParseResumeRequest>): string | null {
  if (typeof body.resumeText !== "string") {
    return "resumeText is required.";
  }

  const text = body.resumeText.trim();
  if (text.length < MIN_RESUME_TEXT_LENGTH) {
    return `resumeText must be at least ${MIN_RESUME_TEXT_LENGTH} characters.`;
  }
  if (text.length > MAX_RESUME_TEXT_LENGTH) {
    return `resumeText exceeds ${MAX_RESUME_TEXT_LENGTH} characters.`;
  }

  if (body.extractedLinks !== undefined) {
    if (!Array.isArray(body.extractedLinks)) {
      return "extractedLinks must be an array of strings.";
    }
    if (body.extractedLinks.length > MAX_LINK_COUNT) {
      return `extractedLinks exceeds ${MAX_LINK_COUNT} items.`;
    }

    for (const link of body.extractedLinks) {
      if (typeof link !== "string") {
        return "extractedLinks must contain only strings.";
      }
      if (link.length > MAX_LINK_LENGTH) {
        return `Each extracted link must be <= ${MAX_LINK_LENGTH} characters.`;
      }
    }
  }

  return null;
}

function normalizeParsedResume(resumeData: ResumeData): ResumeData {
  const contact = resumeData.contact || {
    name: "",
    phone: "",
    email: "",
    linkedin: "",
    github: "",
    portfolio: "",
  };

  resumeData.contact = {
    name: String(contact.name || "").trim(),
    phone: String(contact.phone || ""),
    email: String(contact.email || ""),
    linkedin: String(contact.linkedin || ""),
    github: String(contact.github || ""),
    portfolio: String(contact.portfolio || ""),
  };

  if (!resumeData.contact.name) {
    throw new Error("Could not parse resume: missing contact name.");
  }

  if (!Array.isArray(resumeData.education)) resumeData.education = [];
  if (!Array.isArray(resumeData.experience)) resumeData.experience = [];
  if (!Array.isArray(resumeData.projects)) resumeData.projects = [];
  if (!Array.isArray(resumeData.skills)) resumeData.skills = [];
  if (!Array.isArray(resumeData.achievements)) resumeData.achievements = [];
  if (!Array.isArray(resumeData.certificates)) resumeData.certificates = [];

  if (typeof resumeData.summary !== "string") resumeData.summary = "";
  if (typeof resumeData.showExperience !== "boolean") {
    resumeData.showExperience = resumeData.experience.length > 0;
  }
  if (typeof resumeData.showCertificates !== "boolean") {
    resumeData.showCertificates = resumeData.certificates.length > 0;
  }

  if (
    !Array.isArray(resumeData.sectionOrder) ||
    resumeData.sectionOrder.length === 0
  ) {
    resumeData.sectionOrder = [...DEFAULT_SECTION_ORDER];
  }

  return normalizeResumeDataSpacing(resumeData).normalized;
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

  let body: ParseResumeRequest;
  try {
    body = (await request.json()) as ParseResumeRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON request body." }, 400);
  }

  const validationError = validateRequest(body);
  if (validationError) {
    return jsonResponse({ error: validationError }, 400);
  }

  const resumeText = normalizeExtractedResumeText(body.resumeText.trim());
  const extractedLinks = body.extractedLinks || [];
  const cacheAllowed = body.cacheAllowed;
  const operation = "resume-parse";
  const cacheKey = buildParseCacheKey(resumeText, extractedLinks);

  try {
    const resumeData = await withInFlightDedup<ResumeData>(
      cacheKey,
      async () => {
        if (cacheAllowed) {
          const cached = await readServerCache<ResumeData>(cacheKey);
          if (cached) {
            return normalizeParsedResume(cached);
          }
        }

        const prompt = buildResumeParsePrompt(resumeText, extractedLinks);
        const rawResponse = await callServerAI(
          [
            {
              role: "system",
              content:
                "You are an expert resume parser. You MUST preserve ALL URLs/links from the resume. Output ONLY valid JSON. No markdown, no explanation, no code fences.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          request.signal,
        );

        const parsed = normalizeParsedResume(
          JSON.parse(extractJSON(rawResponse)) as ResumeData,
        );

        if (cacheAllowed) {
          await writeServerCache(operation, cacheKey, parsed);
        }

        return parsed;
      },
    );

    const response: ParseResumeResponse = {
      resumeData,
      cached: cacheAllowed,
    };

    return jsonResponse(response);
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Resume parse failed on the server.",
      },
      500,
    );
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
