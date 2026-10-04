import React, { Suspense } from "react";
import { X, Eye, EyeOff, AlertCircle } from "lucide-react";
import { useAppStore } from "../store/appStore";
import type { ResumeData } from "../types/resume";
import type { TemplateCustomization } from "../types/templates";
import ResumeEditor from "./ResumeEditor";
import ResumeTemplate from "./ResumeTemplate";
import ErrorBoundary from "./ErrorBoundary";
import { PreviewSkeleton } from "./Skeleton";

interface EditorScreenProps {
  handleResumeChange: (data: ResumeData) => void;
  exportCustomizationOverride: Partial<TemplateCustomization> | null;
  isCompactScreen: boolean;
  showMobileResumePreview: boolean;
  setShowMobileResumePreview: (show: boolean) => void;
}

export const EditorScreen: React.FC<EditorScreenProps> = ({
  handleResumeChange,
  exportCustomizationOverride,
  isCompactScreen,
  showMobileResumePreview,
  setShowMobileResumePreview,
}) => {
  const step = useAppStore((s) => s.step);
  const resumeData = useAppStore((s) => s.resumeData);
  const error = useAppStore((s) => s.error);
  const setError = useAppStore((s) => s.setError);

  if (step !== "editor" || !resumeData) return null;

  return (
    <div className="editor-step" role="region" aria-label="Resume editor">
      <div className="editor-left">
        {/* Header actions (Self Score, cooldowns, exports) report problems
            through the store; without this they failed silently here. */}
        {error && (
          <div className="error-banner editor-error" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <span>{error}</span>
            <button
              type="button"
              className="error-banner-dismiss"
              onClick={() => setError(null)}
              aria-label="Dismiss message"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <ResumeEditor
          data={resumeData}
          onChange={handleResumeChange}
        />
        {isCompactScreen && (
          <div className="mobile-resume-trigger-row">
            <div className="mobile-export-row">
              <button
                data-tour="mobile-preview"
                className={`btn-secondary mobile-resume-trigger ${showMobileResumePreview ? "mobile-eye-btn-active" : ""}`}
                onClick={() => setShowMobileResumePreview(!showMobileResumePreview)}
                aria-expanded={showMobileResumePreview}
              >
                {showMobileResumePreview ? <EyeOff size={16} /> : <Eye size={16} />}
                {showMobileResumePreview ? "Hide Resume" : "Show Resume"}
              </button>
            </div>
          </div>
        )}
      </div>
      {!isCompactScreen && (
        <div className="editor-right" data-tour="live-preview">
          <div className="preview-container">
            <ErrorBoundary>
              <Suspense fallback={<PreviewSkeleton />}>
                <ResumeTemplate
                  data={resumeData}
                  customizationOverride={exportCustomizationOverride || undefined}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      )}

      {/* Mobile Preview Toggle Overlay */}
      {isCompactScreen && showMobileResumePreview && (
        <div
          className="mobile-resume-overlay"
          onClick={() => setShowMobileResumePreview(false)}
        >
          <div
            className="mobile-resume-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-resume-sheet-header">
              <h3>Resume Preview</h3>
              <button
                className="mobile-resume-close"
                onClick={() => setShowMobileResumePreview(false)}
                aria-label="Close preview"
              >
                <X size={20} />
              </button>
            </div>
            <div className="mobile-resume-sheet-body">
              <div className="preview-container">
                <ErrorBoundary>
                  <Suspense fallback={<PreviewSkeleton />}>
                    <ResumeTemplate
                      data={resumeData}
                      customizationOverride={exportCustomizationOverride || undefined}
                    />
                  </Suspense>
                </ErrorBoundary>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditorScreen;
