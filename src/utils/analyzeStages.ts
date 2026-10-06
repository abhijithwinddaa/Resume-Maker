/**
 * Named stages for the "analyzing" screen, derived from the loading message.
 * Replaces a percentage that was guessed from the same message and sat at
 * 48% for most of every parse.
 */

export const ANALYZE_STAGES = [
  "Reading your PDF",
  "Understanding your resume",
  "Scoring your resume",
] as const;

export interface AnalyzeStage {
  /** Index into ANALYZE_STAGES of the stage in progress. */
  current: number;
  /** Real OCR progress, when the message reports it. */
  ocr?: { page: number; total: number };
}

export function getAnalyzeStage(message: string): AnalyzeStage {
  const lowered = message.toLowerCase();
  const ocr = message.match(/page\s+(\d+)\s+of\s+(\d+)/i);

  if (ocr) {
    return { current: 0, ocr: { page: Number(ocr[1]), total: Number(ocr[2]) } };
  }
  if (lowered.includes("ats") || lowered.includes("analyz")) {
    return { current: 2 };
  }
  if (lowered.includes("pars")) {
    return { current: 1 };
  }
  return { current: 0 };
}
