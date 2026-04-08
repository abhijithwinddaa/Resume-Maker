import type { ExportPageMode } from "../store/appStore";

export type ExportExperienceTier = "fresher" | "experienced";

export interface ExportPageModeDecision {
  singlePageRequired: boolean;
  fitRequiresSinglePageAttempts: boolean;
}

export function resolveExportPageMode(
  mode: ExportPageMode,
  experienceTier: ExportExperienceTier,
): ExportPageModeDecision {
  if (mode === "force-single-page") {
    return {
      singlePageRequired: true,
      fitRequiresSinglePageAttempts: true,
    };
  }

  if (mode === "auto-adaptive") {
    return {
      singlePageRequired: false,
      fitRequiresSinglePageAttempts: true,
    };
  }

  if (mode === "auto" && experienceTier === "fresher") {
    return {
      singlePageRequired: true,
      fitRequiresSinglePageAttempts: true,
    };
  }

  return {
    singlePageRequired: false,
    fitRequiresSinglePageAttempts: false,
  };
}
