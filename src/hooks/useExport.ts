import { useState, useCallback, useRef } from "react";
import { useClerk, useUser } from "@clerk/clerk-react";
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

export function useExport(resumeRef: React.RefObject<HTMLDivElement | null>) {
  const { openSignIn } = useClerk();
  const { user } = useUser();

  const {
    resumeData,
    setResumeData,
    exportPageMode,
    privacySettings,
    customization,
    setError,
  } = useAppStore();

  const [isExporting, setIsExporting] = useState(false);
  const [exportToastMessage, setExportToastMessage] = useState<string | null>(null);
  const [lastExportPageEstimate, setLastExportPageEstimate] = useState<number | null>(null);
  const [exportCustomizationOverride, setExportCustomizationOverride] = useState<Partial<TemplateCustomization> | null>(null);

  // Feedback Gate State
  const [showFeedbackPanel, setShowFeedbackPanel] = useState(false);
  const [pendingExportFormat, setPendingExportFormat] = useState<"pdf" | "docx" | null>(null);
  const [feedbackInitialTab, setFeedbackInitialTab] = useState<"my" | "community" | "admin">("my");
  
  const feedbackGateCheckInFlightRef = useRef(false);

  // Evaluate PDF spacing & density fitting
  const evaluatePdfFit = useCallback(
    async (
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
        setExportCustomizationOverride(attempt.override);
        await waitForNextPaint();

        const node = resumeRef.current;
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
      await waitForNextPaint();

      return {
        estimatedPages: bestResult.pages,
        stage: bestResult.stage,
        override: bestResult.override,
      };
    },
    [resumeRef],
  );

  const runExportPDF = useCallback(async () => {
    let el = resumeRef.current;
    if (!el) {
      setError("Resume preview not available for export. Please try again.");
      return;
    }
    if (resumeData) {
      let exportData = resumeData;

      const spacingFix = normalizeResumeDataSpacing(exportData);
      if (spacingFix.changedFields > 0) {
        exportData = spacingFix.normalized;
        setResumeData(exportData);

        // Wait for template to render normalized text
        await new Promise((r) => setTimeout(r, 200));
        el = resumeRef.current;
        if (!el) {
          setError("Resume preview not available for export. Please try again.");
          return;
        }
      }

      const validation = validateForExport(exportData);
      if (!validation.valid) {
        setError(validation.errors.join("\n"));
        return;
      }

      // Auto-fix typos
      if (validation.typoWarnings.length > 0) {
        const { fixed, corrections } = autoFixTypos(exportData);
        if (corrections.length > 0) {
          setResumeData(fixed);
          setExportToastMessage(
            `Auto-fixed ${corrections.length} typo${corrections.length > 1 ? "s" : ""}: ${corrections.map((c) => c.split(": ")[1]).join(", ")}`,
          );
          await new Promise((r) => setTimeout(r, 600));

          el = resumeRef.current;
          if (!el) {
            setError("Resume preview not available for export. Please try again.");
            return;
          }
        }
      }
      setError(null);
    }

    const experienceTier = getExperienceTier(resumeData);
    const pageModeDecision = resolveExportPageMode(
      exportPageMode,
      experienceTier,
    );
    const singlePageRequired = pageModeDecision.singlePageRequired;

    setIsExporting(true);
    setExportToastMessage("Preparing PDF...");

    let fitResult = await evaluatePdfFit(
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
        setError(
          "Single-page export cancelled. Trim content or set PDF page mode to allow multi-page.",
        );
        return;
      }

      fitResult = await evaluatePdfFit(false);
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
      `Preparing PDF (${fitResult.estimatedPages} page${fitResult.estimatedPages > 1 ? "s" : ""}, ${stageLabels[fitResult.stage]})...`,
    );

    trackEvent("resume_exported", {
      format: "pdf",
      has_resume_data: Boolean(resumeData),
      embedded_resume_data: privacySettings.embedResumeDataInPdf,
      page_mode: exportPageMode,
      estimated_pages: fitResult.estimatedPages,
      compression_stage: fitResult.stage,
    });

    if (user?.id) {
      void recordFeatureUsage("resume_download");
    }

    try {
      reactToPrintFn();
    } catch (err) {
      console.error("react-to-print failed:", err);
      setError("Failed to open print dialog.");
      setIsExporting(false);
      setExportToastMessage(null);
    }
  }, [
    evaluatePdfFit,
    exportPageMode,
    privacySettings.embedResumeDataInPdf,
    resumeData,
    setError,
    setResumeData,
    user?.id,
  ]);

  const runExportDocx = useCallback(async () => {
    if (!resumeData) {
      setError("No resume data to export. Please create or load a resume first.");
      return;
    }
    let exportData = resumeData;

    const spacingFix = normalizeResumeDataSpacing(exportData);
    if (spacingFix.changedFields > 0) {
      exportData = spacingFix.normalized;
      setResumeData(exportData);
    }

    const validation = validateForExport(exportData);
    if (!validation.valid) {
      setError(validation.errors.join("\n"));
      return;
    }

    if (validation.typoWarnings.length > 0) {
      const { fixed, corrections } = autoFixTypos(exportData);
      if (corrections.length > 0) {
        exportData = fixed;
        setResumeData(fixed);
        setExportToastMessage(
          `Auto-fixed ${corrections.length} typo${corrections.length > 1 ? "s" : ""}: ${corrections.map((c) => c.split(": ")[1]).join(", ")}`,
        );
        await new Promise((r) => setTimeout(r, 600));
      }
    }
    setError(null);
    setIsExporting(true);
    setExportToastMessage("Generating DOCX...");
    try {
      await exportToDocx(exportData, customization);
      trackEvent("resume_exported", { format: "docx" });
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
  }, [resumeData, setError, setResumeData, user?.id, customization]);

  // Hook up react-to-print trigger
  const reactToPrintFn = useReactToPrint({
    contentRef: resumeRef,
    documentTitle: resumeData
      ? `${resumeData.contact.name.replace(/\s+/g, "_")}_Resume`
      : "Resume",
    onAfterPrint: () => {
      setExportCustomizationOverride(null);
      setIsExporting(false);
      setExportToastMessage(null);
    },
    onPrintError: (error) => {
      console.error("PDF export failed:", error);
      trackEvent("resume_export_failed", { format: "pdf" });
      setError("PDF export failed. Please try again.");
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
  };
}
