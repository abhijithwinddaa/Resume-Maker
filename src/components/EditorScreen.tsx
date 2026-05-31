import React, { Suspense } from "react";
import { X } from "lucide-react";
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
  const { step, resumeData } = useAppStore();

  if (step !== "editor" || !resumeData) return null;

  return (
    <div className="editor-step" role="region" aria-label="Resume editor">
      <ResumeEditor
        data={resumeData}
        onChange={handleResumeChange}
      />
      {!isCompactScreen && (
        <div className="editor-right">
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
