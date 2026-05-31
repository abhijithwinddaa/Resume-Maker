import { callServerAI } from "../../src/server/aiRuntime.js";
import { authenticateClerkRequest } from "../../src/server/requestAuth.js";
import { isRequestTooLarge } from "../../src/server/requestUtils.js";
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

  let body: { bulletText?: string; jobDescription?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON request body." }, 400);
  }

  const bulletText = body.bulletText?.trim();
  if (!bulletText) {
    return jsonResponse({ error: "bulletText is required." }, 400);
  }

  const jobDescription = body.jobDescription?.trim();

  try {
    const systemPrompt = 
      "You are an expert resume writer. You optimize individual bullet points on resumes using the STAR method (Situation, Task, Action, Result) to make them action-oriented, professional, metrics-driven, and ATS-friendly. Output ONLY the single optimized bullet point text. Do NOT wrap the response in quotes, code fences, markdown, or prefix it with labels. Keep the output to a single concise sentence.";

    const userContent = jobDescription
      ? `Original Bullet Point: "${bulletText}"\nTarget Job Description:\n"${jobDescription}"\nOptimize this bullet point to match the JD, emphasizing relevant skills and professional impact.`
      : `Original Bullet Point: "${bulletText}"\nOptimize this bullet point for professional impact and clarity.`;

    const rawResponse = await callServerAI(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      request.signal,
    );

    // Sanitize output to remove any quotes the LLM might have outputted
    let optimizedText = rawResponse.trim();
    if (optimizedText.startsWith('"') && optimizedText.endsWith('"')) {
      optimizedText = optimizedText.slice(1, -1);
    }
    if (optimizedText.startsWith('`') && optimizedText.endsWith('`')) {
      optimizedText = optimizedText.slice(1, -1);
    }

    return jsonResponse({ optimizedText });
  } catch (error) {
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
