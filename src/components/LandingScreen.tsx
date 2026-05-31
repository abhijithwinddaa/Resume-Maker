import React from "react";
import { SignedOut, SignedIn } from "@clerk/clerk-react";
import {
  FileText,
  Target,
  Edit3,
  PlusCircle,
  LogIn,
  HardDrive,
} from "lucide-react";
import { useAppStore, type AppMode } from "../store/appStore";
import { loadLocalBackup, formatBackupAge } from "../utils/localBackup";

interface LandingScreenProps {
  user: any;
  pendingMode: AppMode;
  isAuthStarting: boolean;
  handleSelectMode: (mode: AppMode) => void;
  startSignInFlow: (mode: AppMode) => void;
}

const getModeTitle = (selectedMode: AppMode): string => {
  switch (selectedMode) {
    case "ats":
      return "ATS Score & Optimize";
    case "edit":
      return "Edit My Resume";
    case "create":
      return "Create New Resume";
    default:
      return "";
  }
};

export const LandingScreen: React.FC<LandingScreenProps> = ({
  user,
  pendingMode,
  isAuthStarting,
  handleSelectMode,
  startSignInFlow,
}) => {
  const {
    hasBackup,
    privacySettings,
    setActiveResumeId,
    setActiveResumeName,
    setResumeData,
    setJdText,
    setMode,
    setStep,
  } = useAppStore();

  return (
    <div
      className="landing-step"
      role="region"
      aria-label="Choose an option"
    >
      <div className="landing-hero">
        <FileText size={48} className="landing-hero-icon" />
        <h2>Welcome to Resume Maker</h2>
        <p>AI-powered resume building, editing, and ATS optimization</p>
        {isAuthStarting && (
          <p
            className="landing-auth-pending"
            role="status"
            aria-live="polite"
          >
            Opening sign-in... Complete login to continue.
          </p>
        )}
      </div>

      <div className="landing-cards">
        {/* Card 1: ATS Score & Optimize */}
        <div
          className={`landing-card ${!user && pendingMode === "ats" ? "landing-card-selected" : ""}`}
          onClick={() => handleSelectMode("ats")}
          role="button"
          tabIndex={0}
          aria-pressed={!user && pendingMode === "ats"}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleSelectMode("ats");
            }
          }}
          aria-label="ATS Score and Optimize"
        >
          <div className="landing-card-icon landing-card-icon-ats">
            <Target size={32} />
          </div>
          <h3>ATS Score & Optimize</h3>
          <p>
            Have a resume and a job description? Get your ATS score and
            optimize your resume to match the job requirements.
          </p>
          <span className="landing-card-hint">
            {!user && pendingMode === "ats"
              ? "Selected"
              : user
                ? "Click to continue"
                : "Choose this option"}
          </span>
        </div>

        {/* Card 2: Edit My Resume */}
        <div
          className={`landing-card ${!user && pendingMode === "edit" ? "landing-card-selected" : ""}`}
          onClick={() => handleSelectMode("edit")}
          role="button"
          tabIndex={0}
          aria-pressed={!user && pendingMode === "edit"}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleSelectMode("edit");
            }
          }}
          aria-label="Edit My Resume"
        >
          <div className="landing-card-icon landing-card-icon-edit">
            <Edit3 size={32} />
          </div>
          <h3>Edit My Resume</h3>
          <p>
            Already have a resume? Upload or paste it to parse with AI and
            edit in our live preview editor.
          </p>
          <span className="landing-card-hint">
            {!user && pendingMode === "edit"
              ? "Selected"
              : user
                ? "Click to continue"
                : "Choose this option"}
          </span>
        </div>

        {/* Card 3: Create Resume */}
        <div
          className={`landing-card ${!user && pendingMode === "create" ? "landing-card-selected" : ""}`}
          onClick={() => handleSelectMode("create")}
          role="button"
          tabIndex={0}
          aria-pressed={!user && pendingMode === "create"}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleSelectMode("create");
            }
          }}
          aria-label="Create New Resume"
        >
          <div className="landing-card-icon landing-card-icon-create">
            <PlusCircle size={32} />
          </div>
          <h3>Create New Resume</h3>
          <p>
            Don't have a resume yet? Start from scratch using our
            templates and fill in your details.
          </p>
          <span className="landing-card-hint">
            {!user && pendingMode === "create"
              ? "Selected"
              : user
                ? "Click to continue"
                : "Choose this option"}
          </span>
        </div>
      </div>

      <SignedOut>
        <div className="landing-shared-action">
          <p className="landing-selection-copy">
            {pendingMode
              ? `Selected: ${getModeTitle(pendingMode)}. Sign-in opens automatically when you tap a card.`
              : "Choose one option above to sign in and continue."}
          </p>
          <button
            className="landing-primary-btn"
            disabled={!pendingMode || isAuthStarting}
            aria-busy={isAuthStarting}
            onClick={() => {
              if (!pendingMode) return;
              startSignInFlow(pendingMode);
            }}
          >
            <LogIn size={16} />
            {isAuthStarting
              ? "Opening Sign In..."
              : pendingMode
                ? "Continue to Sign In"
                : "Select an Option First"}
          </button>
        </div>
      </SignedOut>
      <SignedIn>
        <div className="landing-shared-action landing-shared-action-signed-in">
          <p className="landing-selection-copy">
            Choose any option above to continue.
          </p>
        </div>
      </SignedIn>

      {/* Restore backup hint */}
      {hasBackup && privacySettings.saveLocalBackups && (
        <div className="landing-backup">
          <button
            className="btn-secondary backup-restore-btn"
            onClick={() => {
              if (!user) return;
              const backup = loadLocalBackup();
              if (backup) {
                setActiveResumeId(null);
                setActiveResumeName(null);
                setResumeData(backup.resumeData, false);
                if (backup.jdText) setJdText(backup.jdText);
                setMode("edit");
                setStep("editor");
              }
            }}
          >
            <HardDrive size={14} />
            Restore Local Backup
            <small>
              ({formatBackupAge(loadLocalBackup()?.timestamp || 0)})
            </small>
          </button>
        </div>
      )}
    </div>
  );
};
export default LandingScreen;
