import React from "react";
import { useUser } from "@clerk/clerk-react";
import { isAdminEmail } from "../utils/adminAccess";
import { trackEvent } from "../utils/analytics";
import FeedbackPanel from "./FeedbackPanel";

interface ExportControlsProps {
  exportToastMessage: string | null;
  showFeedbackPanel: boolean;
  setShowFeedbackPanel: (v: boolean) => void;
  pendingExportFormat: "pdf" | "docx" | null;
  setPendingExportFormat: (f: "pdf" | "docx" | null) => void;
  feedbackInitialTab: "my" | "community" | "admin";
  handleFeedbackCompleted: () => void;
}

export const ExportControls: React.FC<ExportControlsProps> = ({
  exportToastMessage,
  showFeedbackPanel,
  setShowFeedbackPanel,
  pendingExportFormat,
  setPendingExportFormat,
  feedbackInitialTab,
  handleFeedbackCompleted,
}) => {
  const { user } = useUser();
  const userEmail =
    user?.emailAddresses.find((e) => e.id === user?.primaryEmailAddressId)
      ?.emailAddress || "";

  return (
    <>
      {exportToastMessage && (
        <div className="toast-overlay" role="status" aria-live="polite">
          <div className="toast-content">
            <div className="spinner" aria-hidden="true" />
            <span>{exportToastMessage}</span>
          </div>
        </div>
      )}

      {showFeedbackPanel && user?.id && userEmail && (
        <FeedbackPanel
          onClose={() => {
            if (pendingExportFormat) {
              trackEvent("feedback_export_gate_cancelled", {
                format: pendingExportFormat,
              });
              setPendingExportFormat(null);
            }
            setShowFeedbackPanel(false);
          }}
          userId={user.id}
          userEmail={userEmail}
          isAdmin={isAdminEmail(userEmail)}
          onFeedbackSubmitted={handleFeedbackCompleted}
          requireFeedbackForDownload={Boolean(pendingExportFormat)}
          initialTab={feedbackInitialTab}
        />
      )}
    </>
  );
};

export default ExportControls;
