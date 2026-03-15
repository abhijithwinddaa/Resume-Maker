import type { ATSResult } from "./aiService";
import type { ResumeFeedbackSignal } from "./resumeFeedback";

export const OPTIMIZE_PROMPT_VERSION = "v2-structured-safe";

const WEAK_OPENINGS = [
  "worked on",
  "helped with",
  "responsible for",
  "assisted",
  "supported",
  "involved in",
];

const FILLER_PHRASES = [
  "results-driven",
  "hardworking",
  "hard-working",
  "team player",
  "highly motivated",
  "detail-oriented",
  "self-starter",
];

function formatSignal(signal: ResumeFeedbackSignal): string {
  const details = signal.details
    .slice(0, 3)
    .map((detail) => `  - ${detail}`)
    .join("\n");

  return `- ${signal.title} [${signal.status.toUpperCase()}]: ${signal.summary}${details ? `\n${details}` : ""}`;
}

export function buildQualitySignalsBlock(atsReport: ATSResult): string {
  const signals = atsReport.qualityInsights?.signals || [];
  if (signals.length === 0) {
    return "- No local quality signals were generated. Still follow the writing contract below.";
  }

  return signals.map((signal) => formatSignal(signal)).join("\n");
}

export function buildOptimizationWritingContract(): string {
  return [
    "1. Rewrite bullets in this order when evidence exists: strong action verb -> what changed -> tool/context -> measurable outcome.",
    "2. Prefer natural keyword placement inside summary, bullets, and tech stack before dumping terms into skills.",
    `3. Never open bullets with weak phrases like: ${WEAK_OPENINGS.join(", ")}.`,
    `4. Avoid filler phrases like: ${FILLER_PHRASES.join(", ")} unless the resume proves them with evidence.`,
    "5. Preserve truthfulness. Strengthen wording and structure, but do not invent projects, tools, or metrics.",
    "6. Keep URLs, education, contact details, and section order intact.",
    "7. Keep bullets concise and recruiter-readable. Prefer 1 line, allow 2 lines only when needed for clarity.",
  ].join("\n");
}
