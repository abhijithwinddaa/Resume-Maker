import { flushServerErrors } from "../../src/server/errorReporting.js";
import { callServerAI } from "../../src/server/aiRuntime.js";
import { authenticateClerkRequest } from "../../src/server/requestAuth.js";
import {
  checkAIRateLimit,
  rateLimitedResponse,
} from "../../src/server/rateLimit.js";
import { isRequestTooLarge } from "../../src/server/requestUtils.js";
import {
  buildBulletMessages,
  finalizeBullet,
  parseFacts,
} from "../../src/server/bulletRewrite.js";
import {
  isNodeResponse,
  sendNodeResponse,
  toWebRequest,
} from "../../src/server/httpAdapter.js";

import {
  readJsonObject,
  safeErrorResponse,
  optionalString,
  requiredString,
  MAX_JOB_DESCRIPTION_CHARS,
  MAX_BULLET_CHARS,
} from "../../src/server/requestValidation.js";

const MAX_REQUEST_BYTES = 128_000;

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
      { error: "Request body too large." },
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

  const bulletText = requiredString(body, "bulletText", MAX_BULLET_CHARS, {
    label: "bulletText",
    tooLongMessage: `That bullet is too long — please keep it to ${MAX_BULLET_CHARS.toLocaleString("en-US")} characters or fewer.`,
  });
  const jobDescription = optionalString(
    body,
    "jobDescription",
    MAX_JOB_DESCRIPTION_CHARS,
    {
      label: "jobDescription",
      tooLongMessage: `Job description is too long — please paste up to ${MAX_JOB_DESCRIPTION_CHARS.toLocaleString("en-US")} characters.`,
    },
  );
  const facts = parseFacts(body.facts);
  if (body.facts !== undefined && !facts) {
    return jsonResponse({ error: "Invalid result details." }, 400);
  }

  let rawResponse: string | null = null;
  try {
    rawResponse = await callServerAI(
      buildBulletMessages(bulletText, jobDescription, facts),
      request.signal,
      // One rewritten bullet.
      { maxTokens: 800 },
    );
  } catch (error) {
    // With the user's own result in hand we can still write the line ourselves.
    if (!facts) {
      return safeErrorResponse(
        error,
        "Couldn't improve that bullet right now. Please try again.",
        "optimize-bullet",
      );
    }
  }

  const outcome = finalizeBullet(rawResponse, bulletText, facts);
  if (!outcome.ok) {
    return jsonResponse({ error: outcome.error }, 422);
  }
  return jsonResponse({ optimizedText: outcome.text, source: outcome.source });
}

async function handleRequest(request: Request): Promise<Response> {
  try {
    return await handleRequestUnsafe(request);
  } catch (error) {
    return safeErrorResponse(
      error,
      "Couldn't improve that bullet right now. Please try again.",
      "optimize-bullet",
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
