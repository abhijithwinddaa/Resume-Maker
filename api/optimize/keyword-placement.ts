import { callServerAI } from "../../src/server/aiRuntime.js";
import { redactContactForAI } from "../../src/server/aiRedaction.js";
import { extractJSON } from "../../src/server/aiParsing.js";
import {
  isItemGrounded,
  isKnown,
  knownTerms,
  knownTermsFromText,
  resumeContentText,
  termsIn,
} from "../../src/server/groundedTerms.js";
import { numbersGrounded } from "../../src/utils/quantify.js";
import type { ResumeData } from "../../src/types/resume.js";
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

For each missing keyword provided, examine the resume's experience and projects entries. Suggest a change only where the entry already shows evidence the candidate used that keyword — the same tool under another name, a direct synonym, or work that plainly is that thing. Never place a keyword the resume gives no sign of; the candidate must be able to defend every line in an interview.

Rules:
- Suggest MAX 2 placements per keyword. If no entry shows evidence for it, return an empty array for that keyword.
- Only suggest placements in "experience" or "projects" sections.
- "editType": "rewrite" means replacing an existing bullet. "editType": "new" means adding a new bullet.
- For "rewrite", preserve the original meaning and metrics, just integrate the keyword naturally.
- For "new", write a concise bullet that only makes explicit what the entry already shows — no new responsibilities, tools, or outcomes.
- Never introduce a number (metric, percentage, count, duration) that does not already appear in the resume.
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

const SECTIONS = ["experience", "projects"] as const;
type PlacementSection = (typeof SECTIONS)[number];

interface PlacementSuggestion {
  section: PlacementSection;
  index: number;
  editType: "rewrite" | "new";
  bulletIndex: number;
  originalText: string;
  suggestedText: string;
  keyword: string;
  reason: string;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Keep only suggestions that point at a real bullet and add nothing the
 * resume does not already show: numbers must come from the resume, and so must
 * tools — except the suggestion's own keyword, and only when the same
 * experience/project entry already mentions it (or a close form).
 */
export function validateKeywordSuggestions(
  raw: unknown,
  resume: ResumeData,
): Record<string, PlacementSuggestion[]> {
  const result: Record<string, PlacementSuggestion[]> = {};
  if (!raw || typeof raw !== "object") return result;

  const contentText = resumeContentText(resume).join("\n");
  const known = knownTerms(resume);

  for (const [key, list] of Object.entries(raw as Record<string, unknown>)) {
    result[key] = [];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const s = item as Record<string, unknown>;
      if (!SECTIONS.includes(s.section as PlacementSection)) continue;
      const section = s.section as PlacementSection;
      const entries = (resume[section] || []) as Array<{
        bullets?: string[];
        techStack?: string;
      }>;
      const index = s.index;
      if (typeof index !== "number" || !Number.isInteger(index)) continue;
      const entry = entries[index];
      if (!entry) continue;
      const bullets = Array.isArray(entry.bullets) ? entry.bullets : [];

      const editType = s.editType === "new" ? "new" : s.editType === "rewrite" ? "rewrite" : null;
      if (!editType) continue;
      const bulletIndex = typeof s.bulletIndex === "number" ? s.bulletIndex : -1;
      if (typeof s.suggestedText !== "string" || !s.suggestedText.trim()) continue;
      const originalText = typeof s.originalText === "string" ? s.originalText : "";
      if (editType === "rewrite") {
        if (!Number.isInteger(bulletIndex) || bulletIndex < 0 || bulletIndex >= bullets.length) continue;
        if (squash(originalText) !== squash(bullets[bulletIndex] || "")) continue;
      }

      if (!numbersGrounded(s.suggestedText, [contentText])) continue;

      const keyword = typeof s.keyword === "string" && s.keyword.trim() ? s.keyword : key;
      const entryKnown = knownTermsFromText([...bullets, entry.techStack || ""]);
      const keywordShown = isItemGrounded(keyword, entryKnown);
      const keywordKnown = knownTermsFromText([keyword]);
      const invented = [...new Set(termsIn(s.suggestedText))].filter((t) =>
        isKnown(t, keywordKnown) ? !keywordShown : !isKnown(t, known),
      );
      if (invented.length) continue;

      result[key].push({
        section,
        index,
        editType,
        bulletIndex,
        originalText,
        suggestedText: s.suggestedText,
        keyword,
        reason: typeof s.reason === "string" ? s.reason : "",
      });
    }
  }
  return result;
}

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

  const rateLimit = checkAIRateLimit(authResult.user.userId);
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
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
    let userContent = `Resume Data (JSON):\n${JSON.stringify(redactContactForAI(resumeData as ResumeData), null, 2)}\n\nMissing Keywords to Place:\n${missingKeywords.map((k) => `  - ${k}`).join("\n")}`;

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

    const parsed = JSON.parse(extractJSON(rawResponse));

    if (!parsed.suggestions || typeof parsed.suggestions !== "object") {
      throw new Error("Response missing 'suggestions' object");
    }

    return jsonResponse({
      suggestions: validateKeywordSuggestions(
        parsed.suggestions,
        resumeData as ResumeData,
      ),
    });
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
