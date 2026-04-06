import {
  buildCoverLetterCacheKey,
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
import type {
  GenerateCoverLetterRequest,
  GenerateCoverLetterResponse,
} from "../../src/types/serverAI.js";

const MAX_REQUEST_BYTES = 768_000;
const MAX_RESUME_TEXT_LENGTH = 80_000;
const MAX_JD_LENGTH = 12_000;
const MAX_COMPANY_LENGTH = 120;
const MAX_POSITION_LENGTH = 160;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function validateRequest(
  body: Partial<GenerateCoverLetterRequest>,
): string | null {
  if (typeof body.resumeText !== "string" || !body.resumeText.trim()) {
    return "resumeText is required.";
  }
  if (body.resumeText.length > MAX_RESUME_TEXT_LENGTH) {
    return `resumeText exceeds ${MAX_RESUME_TEXT_LENGTH} characters.`;
  }

  if (typeof body.jobDescription !== "string" || !body.jobDescription.trim()) {
    return "jobDescription is required.";
  }
  if (body.jobDescription.length > MAX_JD_LENGTH) {
    return `jobDescription exceeds ${MAX_JD_LENGTH} characters.`;
  }

  if (typeof body.companyName !== "string" || !body.companyName.trim()) {
    return "companyName is required.";
  }
  if (body.companyName.length > MAX_COMPANY_LENGTH) {
    return `companyName exceeds ${MAX_COMPANY_LENGTH} characters.`;
  }

  if (typeof body.position !== "string" || !body.position.trim()) {
    return "position is required.";
  }
  if (body.position.length > MAX_POSITION_LENGTH) {
    return `position exceeds ${MAX_POSITION_LENGTH} characters.`;
  }

  return null;
}

function buildCoverLetterPrompt(
  resumeText: string,
  jobDescription: string,
  companyName: string,
  position: string,
): string {
  return `You are an expert career coach. Write a professional cover letter based on the candidate's resume and the job description.

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

  let body: GenerateCoverLetterRequest;
  try {
    body = (await request.json()) as GenerateCoverLetterRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON request body." }, 400);
  }

  const validationError = validateRequest(body);
  if (validationError) {
    return jsonResponse({ error: validationError }, 400);
  }

  const resumeText = body.resumeText.trim();
  const jobDescription = body.jobDescription.trim();
  const companyName = body.companyName.trim();
  const position = body.position.trim();
  const cacheAllowed = body.cacheAllowed;
  const operation = "cover-letter-generate";
  const cacheKey = buildCoverLetterCacheKey(
    resumeText,
    jobDescription,
    companyName,
    position,
  );

  try {
    const content = await withInFlightDedup<string>(cacheKey, async () => {
      if (cacheAllowed) {
        const cached = await readServerCache<string>(cacheKey);
        if (cached && typeof cached === "string") {
          return cached;
        }
      }

      const prompt = buildCoverLetterPrompt(
        resumeText,
        jobDescription,
        companyName,
        position,
      );

      const generated = await callServerAI(
        [
          {
            role: "system",
            content:
              "You are a professional career coach and cover letter writer.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        request.signal,
      );

      const trimmed = generated.trim();
      if (cacheAllowed) {
        await writeServerCache(operation, cacheKey, trimmed);
      }

      return trimmed;
    });

    const response: GenerateCoverLetterResponse = {
      content,
      cached: cacheAllowed,
    };

    return jsonResponse(response);
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Cover letter generation failed on the server.",
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
