import { flushServerErrors } from "../../src/server/errorReporting.js";
import { buildOptimizePrompt } from "../../src/utils/optimizePrompt.js";
import {
  parseOptimizedResumeResponse,
  type ATSResult,
} from "../../src/server/aiParsing.js";
import { buildSelfOptimizePrompt } from "../../src/utils/selfOptimizePrompt.js";
import { OPTIMIZE_PROMPT_VERSION } from "../../src/utils/optimizePromptShared.js";
import {
  buildRewriteCacheKey,
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
import type { RewriteResumeResponse } from "../../src/types/serverAI.js";
import type { ResumeData } from "../../src/types/resume.js";

import {
  readJsonObject,
  safeErrorResponse,
  optionalString,
  readResumeData,
  readATSResult,
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
  const atsResult = readATSResult<ATSResult>(body);
  const mode = body.mode;
  if (mode !== "jd" && mode !== "self") {
    return jsonResponse({ error: 'mode must be "jd" or "self".' }, 400);
  }
  const iteration = body.iteration;
  if (
    typeof iteration !== "number" ||
    !Number.isFinite(iteration) ||
    iteration < 1 ||
    iteration > 100
  ) {
    return jsonResponse(
      { error: "iteration must be a positive number." },
      400,
    );
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
  const cacheKey = buildRewriteCacheKey(
    mode,
    resumeData,
    jobDescription,
    atsResult,
    iteration,
    OPTIMIZE_PROMPT_VERSION,
  );
  const operation =
    mode === "jd" ? "optimize-rewrite" : "self-optimize-rewrite";

  try {
    const optimizedResume = await withInFlightDedup<ResumeData>(
      cacheKey,
      async () => {
        if (cacheAllowed) {
          const cached = await readServerCache<ResumeData>(cacheKey);
          if (cached) {
            return cached;
          }
        }

        const prompt =
          mode === "jd"
            ? buildOptimizePrompt(
                redactContactForAI(resumeData),
                jobDescription || "",
                atsResult,
                iteration,
              )
            : buildSelfOptimizePrompt(
                redactContactForAI(resumeData),
                atsResult,
                iteration,
              );

        const rawResponse = await callServerAI(
          [
            {
              role: "system",
              content:
                mode === "jd"
                  ? "You are an expert resume optimizer. You output ONLY valid JSON. No markdown, no explanation, no code fences. Incorporate a missing keyword only where the existing resume already shows evidence for it; otherwise leave it out. Never add tools, skills, titles, employers, numbers or outcomes that are not in the resume."
                  : "You are an expert resume optimizer. You output ONLY valid JSON. No markdown, no explanation, no code fences. Improve wording and structure only. Never add tools, skills, titles, employers, numbers or outcomes that are not in the resume.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          request.signal,
          // Returns the whole rewritten resume, so it needs real headroom.
          { maxTokens: 6000 },
        );

        const parsed = parseOptimizedResumeResponse(
          rawResponse,
          resumeData,
          mode === "jd" ? "resume optimization" : "self resume optimization",
        );

        if (cacheAllowed) {
          await writeServerCache(operation, cacheKey, parsed);
        }

        return parsed;
      },
    );

    const response: RewriteResumeResponse = {
      resumeData: optimizedResume,
      cached: cacheAllowed,
    };

    return jsonResponse(response);
  } catch (error) {
    return safeErrorResponse(
      error,
      "Couldn't rewrite the resume right now. Please try again.",
      "optimize-rewrite",
    );
  }
}

async function handleRequest(request: Request): Promise<Response> {
  try {
    return await handleRequestUnsafe(request);
  } catch (error) {
    return safeErrorResponse(
      error,
      "Couldn't rewrite the resume right now. Please try again.",
      "optimize-rewrite",
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
