import { createElement, useState, useCallback, useEffect, useRef } from "react";
import type { ResumeData } from "../types/resume";
import { LOCAL_DEV_AUTH, useClerk, useUser } from "../auth";
import { useReactToPrint } from "react-to-print";
import { useAppStore } from "../store/appStore";
import type { TemplateCustomization } from "../types/templates";
import { exportToDocx } from "../utils/docxExporter";
import { resolveExportPageMode } from "../utils/exportPageMode";
import { normalizeResumeDataSpacing } from "../utils/resumeTextCleanup";
import { validateForExport, autoFixTypos } from "../utils/exportValidation";
import { trackEvent } from "../utils/analytics";
import { recordFeatureUsage } from "../services/popularityService";
import { checkUserHasSubmittedFeedback } from "../services/feedbackService";
import {
  evaluateFeedbackExportGate,
  FEEDBACK_GATE_STATUS_ERROR_MESSAGE,
} from "../utils/feedbackExportGate";
import { getExperienceTier } from "../utils/experienceEstimator";

type CompressionStage = "none" | "tight-spacing" | "compact" | "small-compact";

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function estimateRenderedPages(element: HTMLElement): number {
  const widthPx = element.getBoundingClientRect().width || element.offsetWidth;
  if (!widthPx) return 1;

  const onePagePx = (297 * widthPx) / 210;
  const contentHeightPx = Math.max(
    element.scrollHeight,
    element.getBoundingClientRect().height,
  );
  const tolerancePx = Math.max(2, Math.round(onePagePx * 0.004));

  return Math.max(1, Math.ceil((contentHeightPx - tolerancePx) / onePagePx));
}

interface ExportCopy {
  /** Re-render the copy with a different spacing/size override, synchronously. */
  render: (override: Partial<TemplateCustomization> | null) => void;
  node: () => HTMLDivElement | null;
  dispose: () => void;
}

/**
 * Renders the data to be exported into its own off-screen template, so the PDF
 * is built from the derived copy and not from whatever the live preview shows.
 * Rendering is synchronous (flushSync), so there is nothing to wait for.
 */
async function mountExportCopy(data: ResumeData): Promise<ExportCopy> {
  const [{ default: ResumeTemplate }, { createRoot }, { flushSync }] = await Promise.all([
    import("../components/ResumeTemplate"),
    import("react-dom/client"),
    import("react-dom"),
  ]);
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "-9999px",
    top: "0",
    width: "210mm",
    opacity: "0",
    pointerEvents: "none",
    zIndex: "-1",
  });
  document.body.appendChild(host);
  const root = createRoot(host);
  const holder: { current: HTMLDivElement | null } = { current: null };

  const render = (override: Partial<TemplateCustomization> | null) => {
    flushSync(() => {
      root.render(
        createElement(ResumeTemplate, {
          ref: holder,
          data,
          customizationOverride: override ?? undefined,
          forExport: true,
        }),
      );
    });
  };
  render(null);

  return {
    render,
    node: () => holder.current,
    dispose: () => {
      try {
        root.unmount();
      } finally {
        host.remove();
      }
    },
  };
}

/**
 * Everything export changes about the resume (spacing clean-up, typo fixes)
 * happens on this copy. The user's saved resume is never written to.
 */
function prepareExportData(source: ResumeData):
  | { ok: true; data: ResumeData; note: string | null }
  | { ok: false; errors: string[] } {
  let data = source;
  const spacingFix = normalizeResumeDataSpacing(data);
  if (spacingFix.changedFields > 0) data = spacingFix.normalized;

  const validation = validateForExport(data);
  if (!validation.valid) return { ok: false, errors: validation.errors };

  let note: string | null = null;
  if (validation.typoWarnings.length > 0) {
    const { fixed, corrections } = autoFixTypos(data);
    if (corrections.length > 0) {
      data = fixed;
      note = `Corrected ${corrections.length} typo${corrections.length > 1 ? "s" : ""} in the exported file only (your resume is unchanged): ${corrections.map((c) => c.split(": ")[1]).join(", ")}`;
    }
  }
  return { ok: true, data, note };
}

const HAS_EXPORTED_KEY = "resume-maker:has-exported";

interface UseExportOptions {
  /** A download finished: print dialog closed (PDF) or file saved (DOCX). */
  onExportFinished?: () => void;
}

export function useExport(
  _resumeRef: React.RefObject<HTMLDivElement | null>,
  options: UseExportOptions = {},
) {
  // Read through a ref so the export callbacks needn't re-create per render.
  const onExportFinishedRef = useRef(options.onExportFinished);
  useEffect(() => {
    onExportFinishedRef.current = options.onExportFinished;
  });
  const { openSignIn } = useClerk();
  const { user } = useUser();

  const resumeData = useAppStore((s) => s.resumeData);
  const exportPageMode = useAppStore((s) => s.exportPageMode);
  const customization = useAppStore((s) => s.customization);
  const setError = useAppStore((s) => s.setError);

  const [isExporting, setIsExporting] = useState(false);
  // First download unlocks the floating feedback button: asking for feedback
  // before someone has used the app just covers the screen.
  const [hasExported, setHasExported] = useState(() => {
    try {
      return localStorage.getItem(HAS_EXPORTED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const markExported = useCallback(() => {
    setHasExported(true);
    try {
      localStorage.setItem(HAS_EXPORTED_KEY, "1");
    } catch {
      // Storage blocked: the button just waits for the next session's export.
    }
  }, []);
  const [exportToastMessage, setExportToastMessage] = useState<string | null>(null);
  const [lastExportPageEstimate, setLastExportPageEstimate] = useState<number | null>(null);
  const [exportCustomizationOverride, setExportCustomizationOverride] = useState<Partial<TemplateCustomization> | null>(null);

  // Feedback Gate State
  const [showFeedbackPanel, setShowFeedbackPanel] = useState(false);
  const [pendingExportFormat, setPendingExportFormat] = useState<"pdf" | "docx" | null>(null);
  const [feedbackInitialTab, setFeedbackInitialTab] = useState<"my" | "community" | "admin">("my");
  
  const feedbackGateCheckInFlightRef = useRef(false);
  const exportCopyRef = useRef<ExportCopy | null>(null);
  const disposeExportCopy = useCallback(() => {
    exportCopyRef.current?.dispose();
    exportCopyRef.current = null;
  }, []);
  useEffect(() => disposeExportCopy, [disposeExportCopy]);

  // Evaluate PDF spacing & density fitting
  const evaluatePdfFit = useCallback(
    async (
      copy: ExportCopy,
      requireSinglePage: boolean,
    ): Promise<{
      estimatedPages: number;
      stage: CompressionStage;
      override: Partial<TemplateCustomization> | null;
    }> => {
      const fitAttempts: Array<{
        stage: CompressionStage;
        override: Partial<TemplateCustomization> | null;
      }> = [
        { stage: "none", override: null },
        { stage: "tight-spacing", override: { sectionSpacing: "tight" } },
        {
          stage: "compact",
          override: { sectionSpacing: "tight", lineHeight: "compact" },
        },
        {
          stage: "small-compact",
          override: {
            fontSize: "small",
            lineHeight: "compact",
            sectionSpacing: "tight",
          },
        },
      ];

      const results: Array<{
        stage: CompressionStage;
        override: Partial<TemplateCustomization> | null;
        pages: number;
      }> = [];

      for (const attempt of fitAttempts) {
        // The live preview mirrors the compression; the measured node is the copy.
        setExportCustomizationOverride(attempt.override);
        copy.render(attempt.override);
        await waitForNextPaint();

        const node = copy.node();
        if (!node) {
          continue;
        }

        const pages = estimateRenderedPages(node);
        results.push({
          stage: attempt.stage,
          override: attempt.override,
          pages,
        });

        if (requireSinglePage && pages <= 1) {
          break;
        }
      }

      if (results.length === 0) {
        return { estimatedPages: 1, stage: "none", override: null };
      }

      const standardResult = results.find((r) => r.stage === "none") || results[0];
      const standardPages = standardResult.pages;

      let minPages = standardPages;
      let bestResult = standardResult;

      for (const res of results) {
        if (res.pages < minPages) {
          minPages = res.pages;
          bestResult = res;
        }
      }

      if (requireSinglePage) {
        const singlePageRes = results.find((r) => r.pages === 1);
        if (singlePageRes) {
          bestResult = singlePageRes;
        }
      } else {
        if (minPages < standardPages) {
          const match = results.find((r) => r.pages === minPages);
          if (match) {
            bestResult = match;
          }
        } else {
          bestResult = standardResult;
        }
      }

      setExportCustomizationOverride(bestResult.override);
      copy.render(bestResult.override);
      await waitForNextPaint();

      return {
        estimatedPages: bestResult.pages,
        stage: bestResult.stage,
        override: bestResult.override,
      };
    },
    [],
  );

  const runExportPDF = useCallback(async () => {
    const source = useAppStore.getState().resumeData;
    if (!source) {
      setError("No resume data to export. Please create or load a resume first.");
      return;
    }

    const prepared = prepareExportData(source);
    if (!prepared.ok) {
      setError(prepared.errors.join("\n"));
      return;
    }
    setError(null);
    const exportData = prepared.data;
    const typoNote = prepared.note;

    const experienceTier = getExperienceTier(exportData);
    const pageModeDecision = resolveExportPageMode(
      exportPageMode,
      experienceTier,
    );
    const singlePageRequired = pageModeDecision.singlePageRequired;

    disposeExportCopy();
    let copy: ExportCopy;
    try {
      copy = await mountExportCopy(exportData);
    } catch (err) {
      console.error("Export render failed:", err);
      setError("Resume preview not available for export. Please try again.");
      return;
    }
    exportCopyRef.current = copy;

    setIsExporting(true);
    setExportToastMessage("Preparing PDF...");

    let fitResult = await evaluatePdfFit(
      copy,
      pageModeDecision.fitRequiresSinglePageAttempts,
    );

    if (singlePageRequired && fitResult.estimatedPages > 1) {
      setIsExporting(false);
      setExportToastMessage(null);

      const shouldContinueAsMultiPage = window.confirm(
        `This resume is still ${fitResult.estimatedPages} pages after compact formatting.\n\nPress OK to export as multi-page, or Cancel to trim content first.`,
      );

      if (!shouldContinueAsMultiPage) {
        setExportCustomizationOverride(null);
        disposeExportCopy();
        setError(
          "Single-page export cancelled. Trim content or set PDF page mode to allow multi-page.",
        );
        return;
      }

      fitResult = await evaluatePdfFit(copy, false);
      setIsExporting(true);
    }

    setLastExportPageEstimate(fitResult.estimatedPages);

    const stageLabels: Record<CompressionStage, string> = {
      none: "standard layout",
      "tight-spacing": "tight spacing",
      compact: "compact spacing",
      "small-compact": "small + compact",
    };

    setExportToastMessage(
      `Preparing PDF (${fitResult.estimatedPages} page${fitResult.estimatedPages > 1 ? "s" : ""}, ${stageLabels[fitResult.stage]})...${typoNote ? ` ${typoNote}` : ""}`,
    );

    trackEvent("resume_exported", {
      format: "pdf",
      has_resume_data: true,
      page_mode: exportPageMode,
      estimated_pages: fitResult.estimatedPages,
      compression_stage: fitResult.stage,
    });
    markExported();

    if (user?.id) {
      void recordFeatureUsage("resume_download");
    }

    try {
      // Print the copy built from the export data, not the live preview.
      reactToPrintFn(() => copy.node());
    } catch (err) {
      console.error("react-to-print failed:", err);
      setError("Failed to open print dialog.");
      setIsExporting(false);
      setExportToastMessage(null);
      disposeExportCopy();
    }
  }, [
    disposeExportCopy,
    evaluatePdfFit,
    exportPageMode,
    setError,
    user?.id,
    markExported,
  ]);

  const runExportDocx = useCallback(async () => {
    const source = useAppStore.getState().resumeData;
    if (!source) {
      setError("No resume data to export. Please create or load a resume first.");
      return;
    }

    const prepared = prepareExportData(source);
    if (!prepared.ok) {
      setError(prepared.errors.join("\n"));
      return;
    }
    const exportData = prepared.data;
    setError(null);
    setIsExporting(true);
    setExportToastMessage(
      prepared.note ? `Generating DOCX... ${prepared.note}` : "Generating DOCX...",
    );
    try {
      await exportToDocx(exportData, customization);
      trackEvent("resume_exported", { format: "docx" });
      markExported();
      onExportFinishedRef.current?.();
      if (user?.id) {
        void recordFeatureUsage("resume_download");
      }
    } catch (err) {
      trackEvent("resume_export_failed", { format: "docx" });
      setError(err instanceof Error ? err.message : "DOCX export failed");
    } finally {
      setIsExporting(false);
      setExportToastMessage(null);
    }
  }, [setError, user?.id, customization, markExported]);

  // Hook up react-to-print trigger
  const exportName = (resumeData?.contact?.name ?? "").trim();
  const reactToPrintFn = useReactToPrint({
    // The node to print is passed per call (the export copy), not via contentRef.
    documentTitle: exportName ? `${exportName.replace(/\s+/g, "_")}_Resume` : "Resume",
    onAfterPrint: () => {
      disposeExportCopy();
      setExportCustomizationOverride(null);
      setIsExporting(false);
      setExportToastMessage(null);
      onExportFinishedRef.current?.();
    },
    onPrintError: (error) => {
      console.error("PDF export failed:", error);
      trackEvent("resume_export_failed", { format: "pdf" });
      setError("PDF export failed. Please try again.");
      disposeExportCopy();
      setExportCustomizationOverride(null);
      setIsExporting(false);
      setExportToastMessage(null);
    },
  });

  const requestExportWithFeedbackGate = useCallback(
    async (format: "pdf" | "docx", exportAction: () => Promise<void>) => {
      if (isExporting || feedbackGateCheckInFlightRef.current) return;

      if (!user?.id) {
        openSignIn();
        return;
      }

      // The gate checks the user's feedback in Supabase, which the local
      // test user can't reach — and it fails closed, blocking every export.
      if (LOCAL_DEV_AUTH) {
        await exportAction();
        return;
      }

      feedbackGateCheckInFlightRef.current = true;

      try {
        const submissionState = await checkUserHasSubmittedFeedback(user.id);
        const gateDecision = evaluateFeedbackExportGate(submissionState);

        if (gateDecision.outcome === "allow-export") {
          await exportAction();
          return;
        }

        if (gateDecision.outcome === "block-export") {
          setPendingExportFormat(null);
          setShowFeedbackPanel(false);
          setError(gateDecision.message);
          trackEvent("feedback_export_gate_blocked", {
            format,
            reason: "status_check_error",
          });
          return;
        }

        setPendingExportFormat(format);
        setFeedbackInitialTab("my");
        setShowFeedbackPanel(true);
        trackEvent("feedback_export_gate_shown", { format });
      } catch (error) {
        console.error("Feedback gate status check failed:", error);
        setPendingExportFormat(null);
        setShowFeedbackPanel(false);
        setError(FEEDBACK_GATE_STATUS_ERROR_MESSAGE);
        trackEvent("feedback_export_gate_blocked", {
          format,
          reason: "status_check_exception",
        });
      } finally {
        feedbackGateCheckInFlightRef.current = false;
      }
    },
    [isExporting, openSignIn, setError, user?.id],
  );

  const exportPDF = useCallback(async () => {
    await requestExportWithFeedbackGate("pdf", runExportPDF);
  }, [requestExportWithFeedbackGate, runExportPDF]);

  const exportDocx = useCallback(async () => {
    await requestExportWithFeedbackGate("docx", runExportDocx);
  }, [requestExportWithFeedbackGate, runExportDocx]);

  const handleFeedbackCompleted = useCallback(() => {
    if (!pendingExportFormat) return;
    const format = pendingExportFormat;
    setPendingExportFormat(null);
    setShowFeedbackPanel(false);
    trackEvent("feedback_export_gate_completed", { format });
    if (format === "pdf") {
      void runExportPDF();
    } else if (format === "docx") {
      void runExportDocx();
    }
  }, [pendingExportFormat, runExportDocx, runExportPDF]);

  return {
    isExporting,
    exportToastMessage,
    lastExportPageEstimate,
    exportCustomizationOverride,
    exportPDF,
    exportDocx,
    showFeedbackPanel,
    setShowFeedbackPanel,
    pendingExportFormat,
    setPendingExportFormat,
    feedbackInitialTab,
    setFeedbackInitialTab,
    handleFeedbackCompleted,
    hasExported,
  };
}
