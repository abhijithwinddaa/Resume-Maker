import { buildOptimizePrompt } from "../../src/utils/optimizePrompt";
import {
  parseOptimizedResumeResponse,
  type ATSResult,
} from "../../src/utils/aiService";
import { buildSelfOptimizePrompt } from "../../src/utils/selfOptimizePrompt";
import { OPTIMIZE_PROMPT_VERSION } from "../../src/utils/optimizePromptShared";
import {
  buildRewriteCacheKey,
  readServerCache,
  withInFlightDedup,
  writeServerCache,
} from "../../src/server/aiCacheStore";
import { callServerAI } from "../../src/server/aiRuntime";
import type {
  RewriteResumeRequest,
  RewriteResumeResponse,
} from "../../src/types/serverAI";
import type { ResumeData } from "../../src/types/resume";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function validateRequest(body: Partial<RewriteResumeRequest>): string | null {
  if (!body.resumeData || typeof body.resumeData !== "object") {
    return "resumeData is required.";
  }
  if (!body.atsResult || typeof body.atsResult !== "object") {
    return "atsResult is required.";
  }
  if (body.mode !== "jd" && body.mode !== "self") {
    return 'mode must be "jd" or "self".';
  }
  if (typeof body.iteration !== "number" || body.iteration < 1) {
    return "iteration must be a positive number.";
  }
  if (body.mode === "jd" && !body.jobDescription?.trim()) {
    return "jobDescription is required for JD mode.";
  }
  return null;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let body: RewriteResumeRequest;
  try {
    body = (await request.json()) as RewriteResumeRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON request body." }, 400);
  }

  const validationError = validateRequest(body);
  if (validationError) {
    return jsonResponse({ error: validationError }, 400);
  }

  const { resumeData, jobDescription, atsResult, iteration, mode, cacheAllowed } =
    body;
  const cacheKey = buildRewriteCacheKey(
    mode,
    resumeData,
    jobDescription,
    atsResult,
    iteration,
    OPTIMIZE_PROMPT_VERSION,
  );
  const operation = mode === "jd" ? "optimize-rewrite" : "self-optimize-rewrite";

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
                resumeData,
                jobDescription || "",
                atsResult as ATSResult,
                iteration,
              )
            : buildSelfOptimizePrompt(
                resumeData,
                atsResult as ATSResult,
                iteration,
              );

        const rawResponse = await callServerAI(
          [
            {
              role: "system",
              content:
                mode === "jd"
                  ? "You are an expert resume optimizer. You output ONLY valid JSON. No markdown, no explanation, no code fences. You must incorporate ALL missing keywords and skills from the ATS report."
                  : "You are an expert resume optimizer. You output ONLY valid JSON. No markdown, no explanation, no code fences. You must improve the resume based on general best practices.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          request.signal,
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
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Resume rewrite failed on the server.",
      },
      500,
    );
  }
}
