import { describe, expect, it } from "vitest";
import { getAnalyzeStage } from "../utils/analyzeStages";

describe("getAnalyzeStage", () => {
  it("reports real OCR page progress while reading a scanned PDF", () => {
    expect(getAnalyzeStage("Running OCR on page 2 of 3...")).toEqual({
      current: 0,
      ocr: { page: 2, total: 3 },
    });
  });

  it("starts on reading the PDF", () => {
    expect(getAnalyzeStage("Image-based PDF detected — running OCR to extract text...").current).toBe(0);
    expect(getAnalyzeStage("Reading PDF file...").current).toBe(0);
  });

  it("moves to understanding the resume while parsing", () => {
    expect(getAnalyzeStage("Parsing your resume with AI (preserving all links)...").current).toBe(1);
  });

  it("moves to scoring for JD, self, and re-analysis", () => {
    for (const msg of [
      "Running ATS analysis...",
      "Running self ATS analysis...",
      "Re-analyzing with ATS...",
      "Running ATS analysis against new JD...",
    ]) {
      expect(getAnalyzeStage(msg).current).toBe(2);
    }
  });
});
