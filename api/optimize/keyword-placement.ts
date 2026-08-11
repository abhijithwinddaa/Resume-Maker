import { callServerAI } from "../../src/server/aiRuntime.js";
import { authenticateClerkRequest } from "../../src/server/requestAuth.js";
import { isRequestTooLarge } from "../../src/server/requestUtils.js";
import {
  isNodeResponse,
  sendNodeResponse,
  toWebRequest,
} from "../../src/server/httpAdapter.js";

const MAX_REQUEST_BYTES = 256_000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

const SYSTEM_PROMPT = `You are an expert ATS resume consultant. Your task is to analyze a candidate's resume and identify exactly where each missing keyword can be naturally inserted into their Experience or Projects sections.

For each missing keyword provided, examine the resume's experience and projects entries. If you find a natural place to add or modify a bullet point to include that keyword, suggest the change.

Rules:
- Suggest MAX 2 placements per keyword. If no good placement exists, return an empty array for that keyword.
- Only suggest placements in "experience" or "projects" sections.
- "editType": "rewrite" means replacing an existing bullet. "editType": "new" means adding a new bullet.
- For "rewrite", preserve the original meaning and metrics, just integrate the keyword naturally.
- For "new", write a concise bullet that introduces the keyword in a realistic context matching the role.
- The "reason" field must be a one-sentence explanation of why this placement works.
- Output ONLY valid JSON matching the schema below. No markdown, no code fences, no extra text.

Response schema:
{
  "suggestions": {
    "keyword_string": [
      {
        "section": "experience" | "projects",
        "index": number,
        "editType": "rewrite" | "new",
        "bulletIndex": number,
        "originalText": "string",
        "suggestedText": "string",
        "keyword": "string",
        "reason": "string"
      }
    ]
  }
}`;

async function handleRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  if (isRequestTooLarge(request, MAX_REQUEST_BYTES)) {
    return jsonResponse({ error: "Request body too large." }, 413);
  }

  const authResult = await authenticateClerkRequest(request);
  if (!authResult.ok) {
    return jsonResponse({ error: authResult.message }, authResult.status);
  }

  let body: { resumeData?: unknown; missingKeywords?: string[]; jobDescription?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON request body." }, 400);
  }

  if (!body.resumeData || !body.missingKeywords || body.missingKeywords.length === 0) {
    return jsonResponse(
      { error: "resumeData and missingKeywords are required." },
      400,
    );
  }

  const resumeData = body.resumeData;
  const missingKeywords = body.missingKeywords;
  const jobDescription = body.jobDescription?.trim();

  try {
    let userContent = `Resume Data (JSON):\n${JSON.stringify(resumeData, null, 2)}\n\nMissing Keywords to Place:\n${missingKeywords.map((k) => `  - ${k}`).join("\n")}`;

    if (jobDescription) {
      userContent += `\n\nTarget Job Description:\n${jobDescription}`;
    }

    const rawResponse = await callServerAI(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      request.signal,
      // A list of suggested edits with their rationale.
      { maxTokens: 2500 },
    );

    // Parse JSON from response (strip any potential markdown fences)
    let cleaned = rawResponse.trim();
    if (cleaned.startsWith("```")) {
      const firstNewline = cleaned.indexOf("\n");
      if (firstNewline !== -1) {
        cleaned = cleaned.slice(firstNewline + 1);
      }
      if (cleaned.endsWith("```")) {
        cleaned = cleaned.slice(0, -3);
      }
    }
    cleaned = cleaned.trim();

    const parsed = JSON.parse(cleaned);

    // Validate shape
    if (!parsed.suggestions || typeof parsed.suggestions !== "object") {
      throw new Error("Response missing 'suggestions' object");
    }

    return jsonResponse({ suggestions: parsed.suggestions });
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Keyword placement analysis failed.",
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
