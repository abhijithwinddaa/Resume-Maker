import { describe, expect, it } from "vitest";
import {
  evaluateFeedbackExportGate,
  FEEDBACK_GATE_STATUS_ERROR_MESSAGE,
} from "../utils/feedbackExportGate";

describe("evaluateFeedbackExportGate", () => {
  it("allows export when feedback has been submitted and check succeeds", () => {
    expect(
      evaluateFeedbackExportGate({ hasSubmitted: true, hadError: false }),
    ).toEqual({ outcome: "allow-export" });
  });

  it("requires feedback when no submission exists and check succeeds", () => {
    expect(
      evaluateFeedbackExportGate({ hasSubmitted: false, hadError: false }),
    ).toEqual({ outcome: "require-feedback" });
  });

  it("blocks export when feedback status check reports an error", () => {
    expect(
      evaluateFeedbackExportGate({ hasSubmitted: false, hadError: true }),
    ).toEqual({
      outcome: "block-export",
      message: FEEDBACK_GATE_STATUS_ERROR_MESSAGE,
    });
  });

  it("fails closed when check result is missing", () => {
    expect(evaluateFeedbackExportGate(null)).toEqual({
      outcome: "block-export",
      message: FEEDBACK_GATE_STATUS_ERROR_MESSAGE,
    });
  });

  it("fails closed on contradictory check results", () => {
    expect(
      evaluateFeedbackExportGate({ hasSubmitted: true, hadError: true }),
    ).toEqual({
      outcome: "block-export",
      message: FEEDBACK_GATE_STATUS_ERROR_MESSAGE,
    });
  });
});
