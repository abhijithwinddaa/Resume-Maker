import type { FeedbackSubmissionCheckResult } from "../services/feedbackService";

export const FEEDBACK_GATE_STATUS_ERROR_MESSAGE =
  "We couldn't verify your feedback status right now. Please try again in a few seconds.";

export type FeedbackExportGateDecision =
  | { outcome: "allow-export" }
  | { outcome: "require-feedback" }
  | { outcome: "block-export"; message: string };

export function evaluateFeedbackExportGate(
  submissionState: FeedbackSubmissionCheckResult | null | undefined,
): FeedbackExportGateDecision {
  if (!submissionState || submissionState.hadError) {
    // Fail closed: if status cannot be trusted, do not allow export.
    return {
      outcome: "block-export",
      message: FEEDBACK_GATE_STATUS_ERROR_MESSAGE,
    };
  }

  if (submissionState.hasSubmitted) {
    return { outcome: "allow-export" };
  }

  return { outcome: "require-feedback" };
}
