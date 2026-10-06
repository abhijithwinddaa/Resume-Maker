import {
  CHANGE_TYPES,
  buildTemplateBullet,
  numbersGrounded,
  type ChangeTypeId,
} from "../utils/quantify.js";

/**
 * Prompting and guarding for the single-bullet rewrite (/api/optimize/bullet).
 *
 * Two modes:
 * - enhance: tighten the wording; no new numbers allowed.
 * - quantify: weave in the result the user just gave us ("facts"); the only
 *   numbers allowed are the user's.
 * Either way a rewrite that adds a number the user never wrote is rejected.
 */

export interface BulletFacts {
  changeType: ChangeTypeId;
  amount: string;
  detail?: string;
}

type ChatMessage = { role: "system" | "user"; content: string };

const MAX_AMOUNT = 80;
const MAX_DETAIL = 240;

/** Validate the client's facts; null when absent or malformed. */
export function parseFacts(input: unknown): BulletFacts | null {
  if (!input || typeof input !== "object") return null;
  const { changeType, amount, detail } = input as Record<string, unknown>;
  if (!CHANGE_TYPES.some((t) => t.id === changeType)) return null;
  if (typeof amount !== "string" || !amount.trim() || amount.length > MAX_AMOUNT) return null;
  if (detail !== undefined && (typeof detail !== "string" || detail.length > MAX_DETAIL)) return null;
  return {
    changeType: changeType as ChangeTypeId,
    amount: amount.trim(),
    detail: typeof detail === "string" && detail.trim() ? detail.trim() : undefined,
  };
}

// How each kind of result reads in the prompt (the chip labels are UI copy).
const RESULT_KIND: Record<ChangeTypeId, string> = {
  faster: "how much faster something became",
  users: "how many people used it",
  quality: "how much errors or bugs went down",
  time: "how much time it saved",
  money: "how much revenue it brought in",
  cost: "how much cost it cut",
  scale: "how much volume it handled",
  team: "how many people the candidate led or trained",
  rank: "where it placed or what it won",
};

const BASE_RULES =
  "Do not overstate the candidate's role: if they helped, assisted, or contributed, keep it that way (\"contributed to\", \"partnered on\") rather than claiming they led it. Keep every metric the original states, and never introduce a number, tool, or outcome it does not — the candidate must be able to defend the line in an interview. Output ONLY the single optimized bullet point text. Do NOT wrap the response in quotes, code fences, markdown, or prefix it with labels. Keep the output to a single concise sentence.";

export function buildBulletMessages(
  bulletText: string,
  jobDescription: string | undefined,
  facts: BulletFacts | null,
): ChatMessage[] {
  if (facts) {
    return [
      {
        role: "system",
        content:
          "You are an expert resume writer. Rewrite one resume bullet as a single natural sentence: a strong past-tense action verb, what the candidate did and how, and the result with the candidate's amount. Example: \"Rebuilt the checkout page in React, cutting page load time by ~40%.\" Never write formula words such as \"as measured by\". Use ONLY the facts provided: the result and amount come from the candidate. Do not add any other number, percentage, timeframe, tool, or outcome. Estimates such as \"~\" or \"about\" must stay estimates. " +
          BASE_RULES,
      },
      {
        role: "user",
        content: [
          `Original bullet: "${bulletText}"`,
          `The result is ${RESULT_KIND[facts.changeType]}. The candidate says: ${facts.amount}`,
          facts.detail ? `What improved (from the candidate): ${facts.detail}` : "",
          jobDescription ? `Target job description:\n"${jobDescription}"` : "",
          "Rewrite the bullet so the result is clear.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ];
  }

  return [
    {
      role: "system",
      content:
        "You are an expert resume writer. You optimize individual bullet points on resumes using the STAR method (Situation, Task, Action, Result) to make them action-oriented, professional, and ATS-friendly. " +
        BASE_RULES,
    },
    {
      role: "user",
      content: jobDescription
        ? `Original Bullet Point: "${bulletText}"\nTarget Job Description:\n"${jobDescription}"\nOptimize this bullet point to match the JD, emphasizing relevant skills and professional impact.`
        : `Original Bullet Point: "${bulletText}"\nOptimize this bullet point for professional impact and clarity.`,
    },
  ];
}

/** Strip wrappers models add despite instructions. */
export function cleanBulletOutput(raw: string): string {
  let text = raw.trim().split(/\r?\n/).find((line) => line.trim()) ?? "";
  text = text.trim().replace(/^(?:[-*•]\s+|optimized bullet(?: point)?:\s*)/i, "");
  for (const quote of ['"', "`", "'"]) {
    if (text.length > 1 && text.startsWith(quote) && text.endsWith(quote)) {
      text = text.slice(1, -1).trim();
    }
  }
  return text;
}

export type BulletOutcome =
  | { ok: true; text: string; source: "ai" | "template" }
  | { ok: false; error: string };

export const INVENTED_NUMBER_ERROR =
  "The AI tried to add numbers you never gave, so your bullet was left as is. Use \"Add a result\" to add your own.";

/**
 * Accept the AI rewrite only if its numbers are the user's. In quantify mode a
 * bad or missing rewrite falls back to a plain template with the user's amount.
 */
export function finalizeBullet(
  rawAI: string | null,
  bulletText: string,
  facts: BulletFacts | null,
): BulletOutcome {
  const text = rawAI ? cleanBulletOutput(rawAI) : "";
  const sources = [bulletText, facts?.amount ?? "", facts?.detail ?? ""];

  if (facts) {
    const keepsAmount = numbersGrounded(facts.amount, [text]);
    if (text && numbersGrounded(text, sources) && keepsAmount) {
      return { ok: true, text, source: "ai" };
    }
    return {
      ok: true,
      text: buildTemplateBullet(bulletText, facts.changeType, facts.amount),
      source: "template",
    };
  }

  if (!text) return { ok: false, error: "The AI returned an empty bullet. Please try again." };
  if (!numbersGrounded(text, sources)) return { ok: false, error: INVENTED_NUMBER_ERROR };
  return { ok: true, text, source: "ai" };
}
