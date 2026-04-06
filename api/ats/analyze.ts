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
import { authenticateClerkRequest } from "../../src/server/requestAuth.js";
import { isRequestTooLarge } from "../../src/server/requestUtils.js";
import {
  isNodeResponse,
  sendNodeResponse,
  toWebRequest,
} from "../../src/server/httpAdapter.js";
import type {
  AnalyzeATSRequest,
  AnalyzeATSResponse,
} from "../../src/types/serverAI.js";

const MAX_REQUEST_BYTES = 512_000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function validateRequest(body: Partial<AnalyzeATSRequest>): string | null {
  if (!body.resumeData || typeof body.resumeData !== "object") {
    return "resumeData is required.";
  }
  if (body.mode !== "jd" && body.mode !== "self") {
    return 'mode must be "jd" or "self".';
  }
  if (body.mode === "jd" && !body.jobDescription?.trim()) {
    return "jobDescription is required for JD mode.";
  }
  return null;
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

  let body: AnalyzeATSRequest;
  try {
    body = (await request.json()) as AnalyzeATSRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON request body." }, 400);
  }

  const validationError = validateRequest(body);
  if (validationError) {
    return jsonResponse({ error: validationError }, 400);
  }

  const { resumeData, jobDescription, mode, cacheAllowed } = body;
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
          ? buildATSPrompt(resumeData, jobDescription || "")
          : buildSelfATSPrompt(resumeData);

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
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "ATS analysis failed on the server.",
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
