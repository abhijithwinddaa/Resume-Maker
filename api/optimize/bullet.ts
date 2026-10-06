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

const MAX_REQUEST_BYTES = 128_000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

async function handleRequest(request: Request): Promise<Response> {
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

  const rateLimit = checkAIRateLimit(authResult.user.userId);
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  let body: { bulletText?: string; jobDescription?: string; facts?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON request body." }, 400);
  }

  const bulletText = body.bulletText?.trim();
  if (!bulletText) {
    return jsonResponse({ error: "bulletText is required." }, 400);
  }

  const jobDescription = body.jobDescription?.trim() || undefined;
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
      return jsonResponse(
        {
          error:
            error instanceof Error
              ? error.message
              : "AI bullet optimization failed.",
        },
        500,
      );
    }
  }

  const outcome = finalizeBullet(rawResponse, bulletText, facts);
  if (!outcome.ok) {
    return jsonResponse({ error: outcome.error }, 422);
  }
  return jsonResponse({ optimizedText: outcome.text, source: outcome.source });
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
