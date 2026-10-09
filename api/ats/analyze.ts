import { flushServerErrors } from "../../src/server/errorReporting.js";
import { buildATSPrompt } from "../../src/utils/atsPrompt.js";
import {
  parseATSResultResponse,
  type ATSResult,
} from "../../src/server/aiParsing.js";
import { buildSelfATSPrompt } from "../../src/utils/selfATSPrompt.js";
import {
  buildAnalyzeCacheKey,
  readServerCache,
  withInFlightDedup,
  writeServerCache,
} from "../../src/server/aiCacheStore.js";
import { callServerAI } from "../../src/server/aiRuntime.js";
import { redactContactForAI } from "../../src/server/aiRedaction.js";
import { authenticateClerkRequest } from "../../src/server/requestAuth.js";
import {
  checkAIRateLimit,
  rateLimitedResponse,
} from "../../src/server/rateLimit.js";
import { isRequestTooLarge } from "../../src/server/requestUtils.js";
import {
  isNodeResponse,
  sendNodeResponse,
  toWebRequest,
} from "../../src/server/httpAdapter.js";
import type { AnalyzeATSResponse } from "../../src/types/serverAI.js";
import type { ResumeData } from "../../src/types/resume.js";

import {
  readJsonObject,
  safeErrorResponse,
  optionalString,
  readResumeData,
  MAX_JOB_DESCRIPTION_CHARS,
} from "../../src/server/requestValidation.js";

const MAX_REQUEST_BYTES = 512_000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

async function handleRequestUnsafe(request: Request): Promise<Response> {
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

  const rateLimit = await checkAIRateLimit(authResult.user.userId);
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  const parsedBody = await readJsonObject(request, MAX_REQUEST_BYTES);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body;

  const resumeData = readResumeData<ResumeData>(body);
  const mode = body.mode;
  if (mode !== "jd" && mode !== "self") {
    return jsonResponse({ error: 'mode must be "jd" or "self".' }, 400);
  }
  const jobDescription = optionalString(
    body,
    "jobDescription",
    MAX_JOB_DESCRIPTION_CHARS,
    {
      label: "jobDescription",
      tooLongMessage: `Job description is too long — please paste up to ${MAX_JOB_DESCRIPTION_CHARS.toLocaleString("en-US")} characters.`,
    },
  );
  if (mode === "jd" && !jobDescription) {
    return jsonResponse(
      { error: "jobDescription is required for JD mode." },
      400,
    );
  }
  const cacheAllowed = body.cacheAllowed === true;
  const cacheKey = buildAnalyzeCacheKey(mode, resumeData, jobDescription);
  const operation = mode === "jd" ? "ats-analyze" : "self-ats-analyze";

  try {
    const atsResult = await withInFlightDedup<ATSResult>(cacheKey, async () => {
      if (cacheAllowed) {
        const cached = await readServerCache<ATSResult>(cacheKey);
        if (cached) {
          return cached;
        }
      }

      const prompt =
        mode === "jd"
          ? buildATSPrompt(redactContactForAI(resumeData), jobDescription || "")
          : buildSelfATSPrompt(redactContactForAI(resumeData));

      const rawResponse = await callServerAI(
        [
          {
            role: "system",
            content:
              "You are an expert ATS analyzer. You output ONLY valid JSON. No markdown, no explanation, no code fences.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        request.signal,
        // A scored breakdown plus suggestions — a few hundred lines of JSON.
        // Stable: the optimize loop compares this score against a rescan.
        { maxTokens: 2500, stable: true },
      );

      const parsed = parseATSResultResponse(
        rawResponse,
        resumeData,
        mode === "jd" ? "ATS analysis" : "self ATS analysis",
      );

      if (cacheAllowed) {
        await writeServerCache(operation, cacheKey, parsed);
      }

      return parsed;
    });

    const response: AnalyzeATSResponse = {
      atsResult,
      cached: cacheAllowed,
    };

    return jsonResponse(response);
  } catch (error) {
    return safeErrorResponse(
      error,
      "Couldn't analyze the resume right now. Please try again.",
      "ats-analyze",
    );
  }
}

async function handleRequest(request: Request): Promise<Response> {
  try {
    return await handleRequestUnsafe(request);
  } catch (error) {
    return safeErrorResponse(
      error,
      "Couldn't analyze the resume right now. Please try again.",
      "ats-analyze",
    );
  }
}

export default async function handler(
  requestOrNodeReq: Request | Record<string, unknown>,
  maybeNodeRes?: unknown,
): Promise<Response | void> {
  const request = toWebRequest(requestOrNodeReq);
  const response = await handleRequest(request);
  await flushServerErrors();

  if (isNodeResponse(maybeNodeRes)) {
    await sendNodeResponse(maybeNodeRes, response);
    return;
  }

  return response;
}
