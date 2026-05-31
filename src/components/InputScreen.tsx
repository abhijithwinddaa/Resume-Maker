import React from "react";
import {
  FileText,
  FileUp,
  X,
  Upload,
  Target,
  AlertCircle,
  Clock,
  Search,
  Edit3,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import { LIMITS } from "../utils/inputValidation";
import { formatCooldown } from "../utils/rateLimiter";

interface InputScreenProps {
  pdfInputRef: React.RefObject<HTMLInputElement | null>;
  isPdfLoading: boolean;
  pdfLoadPercent: number;
  handlePdfUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleClearUpload: () => void;
  handleAnalyze: () => void;
  handleAnalyzeExisting: () => void;
  handleParseResume: () => void;
  handleBackToLanding: () => void;
  useStickyMobileActions: boolean;
  isAnalyzeCoolingDown: boolean;
  analyzeCooldownRemaining: number;
  atsResumeSource: "existing" | "new";
  setAtsResumeSource: (source: "existing" | "new") => void;
}

export const InputScreen: React.FC<InputScreenProps> = ({
  pdfInputRef,
  isPdfLoading,
  pdfLoadPercent,
  handlePdfUpload,
  handleClearUpload,
  handleAnalyze,
  handleAnalyzeExisting,
  handleParseResume,
  handleBackToLanding,
  useStickyMobileActions,
  isAnalyzeCoolingDown,
  analyzeCooldownRemaining,
  atsResumeSource,
  setAtsResumeSource,
}) => {
  const {
    step,
    mode,
    resumeData,
    uploadedFileName,
    setUploadedFileName,
    resumeText,
    setResumeText,
    jdText,
    setJdText,
    loadingMessage,
    error,
    setError,
    setStep,
  } = useAppStore();

  return (
    <>
      {/* ═══ INPUT STEP — ATS MODE ═══ */}
      {step === "input" && mode === "ats" && (
        <div
          className="input-step"
          role="region"
          aria-label="Resume and JD input"
        >
          <div className="input-hero">
            <h2>ATS Score & Optimize</h2>
            <p>
              {resumeData && atsResumeSource === "existing"
                ? "Use your saved resume or switch to upload a new one for this ATS run."
                : "Paste your resume and the target job description to get an ATS score."}
            </p>
          </div>

          {resumeData && (
            <div
              className="ats-source-choice"
              role="group"
              aria-label="Resume source"
            >
              <button
                className={`header-btn header-btn-labeled ${atsResumeSource === "existing" ? "btn-accent" : ""}`}
                onClick={() => {
                  setAtsResumeSource("existing");
                  setError(null);
                }}
              >
                Use Existing Resume
              </button>
              <button
                className={`header-btn header-btn-labeled ${atsResumeSource === "new" ? "btn-accent" : ""}`}
                onClick={() => {
                  setAtsResumeSource("new");
                  setError(null);
                }}
              >
                Upload New Resume
              </button>
            </div>
          )}

          {resumeData && atsResumeSource === "new" && (
            <p className="ats-source-note">
              You are analyzing a new resume. Your saved resume remains
              unchanged.
            </p>
          )}

          <div
            className={
              resumeData && atsResumeSource === "existing"
                ? "input-grid input-grid-single"
                : "input-grid"
            }
          >
            {(!resumeData || atsResumeSource === "new") && (
              <div className="input-card">
                <div className="input-label-row">
                  <label className="input-label">
                    <FileText size={16} />
                    Your Resume
                  </label>
                  <div className="upload-actions">
                    {uploadedFileName && (
                      <span className="uploaded-file">
                        <FileUp size={12} />
                        {uploadedFileName}
                        <button
                          className="clear-upload"
                          onClick={handleClearUpload}
                          aria-label="Clear upload"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    )}
                    <label
                      className={`upload-btn ${isPdfLoading ? "disabled" : ""}`}
                      aria-disabled={isPdfLoading}
                    >
                      <Upload size={13} />
                      {isPdfLoading ? "Processing..." : "Upload PDF"}
                      {!isPdfLoading && (
                        <input
                          ref={pdfInputRef}
                          type="file"
                          accept=".pdf"
                          onChange={handlePdfUpload}
                          hidden
                          aria-label="Upload PDF"
                        />
                      )}
                    </label>
                  </div>
                </div>
                {isPdfLoading ? (
                  <div className="pdf-loading">
                    <div className="loading-progress-number">
                      {pdfLoadPercent}%
                    </div>
                    <div
                      className="loading-progress-track"
                      aria-hidden="true"
                    >
                      <div
                        className="loading-progress-fill"
                        style={{ width: `${pdfLoadPercent}%` }}
                      />
                    </div>
                    <span>
                      {loadingMessage || "Extracting text from PDF..."}
                    </span>
                  </div>
                ) : (
                  <>
                    <textarea
                      className="input-textarea"
                      placeholder="Paste your full resume text here or upload a PDF..."
                      value={resumeText}
                      maxLength={LIMITS.MAX_RESUME_TEXT_LENGTH}
                      onChange={(e) => {
                        setResumeText(e.target.value);
                        if (uploadedFileName) setUploadedFileName(null);
                      }}
                      aria-label="Resume text"
                    />
                    <small className="char-count">
                      {resumeText.length.toLocaleString()} /{" "}
                      {LIMITS.MAX_RESUME_TEXT_LENGTH.toLocaleString()}
                    </small>
                  </>
                )}
              </div>
            )}
            <div className="input-card">
              <label className="input-label">
                <Target size={16} />
                Job Description
              </label>
              <textarea
                className="input-textarea"
                placeholder="Paste the target job description here..."
                value={jdText}
                maxLength={LIMITS.MAX_JD_LENGTH}
                onChange={(e) => setJdText(e.target.value)}
                aria-label="Job description"
              />
              <small className="char-count">
                {jdText.length.toLocaleString()} /{" "}
                {LIMITS.MAX_JD_LENGTH.toLocaleString()}
              </small>
            </div>
          </div>

          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div
            className={`input-actions-row ${useStickyMobileActions ? "input-actions-row-sticky" : ""}`}
          >
            {resumeData && atsResumeSource === "existing" ? (
              <button
                className="analyze-btn"
                onClick={handleAnalyzeExisting}
                disabled={!jdText.trim() || isAnalyzeCoolingDown}
              >
                {isAnalyzeCoolingDown ? (
                  <>
                    <Clock size={18} />
                    Wait {formatCooldown(analyzeCooldownRemaining)}
                  </>
                ) : (
                  <>
                    <Search size={18} />
                    Analyze with JD
                  </>
                )}
              </button>
            ) : (
              <button
                className="analyze-btn"
                onClick={handleAnalyze}
                disabled={
                  (atsResumeSource === "new"
                    ? !resumeText.trim() && !uploadedFileName && !resumeData
                    : !resumeText.trim() && !resumeData) ||
                  !jdText.trim() ||
                  isPdfLoading ||
                  isAnalyzeCoolingDown
                }
              >
                {isAnalyzeCoolingDown ? (
                  <>
                    <Clock size={18} />
                    Wait {formatCooldown(analyzeCooldownRemaining)}
                  </>
                ) : (
                  <>
                    <Search size={18} />
                    Analyze Resume
                  </>
                )}
              </button>
            )}
            {resumeData && (
              <button
                className="btn-secondary"
                onClick={() => setStep("editor")}
              >
                Back to Editor
              </button>
            )}
            <button className="btn-secondary" onClick={handleBackToLanding}>
              Back
            </button>
          </div>
        </div>
      )}

      {/* ═══ INPUT STEP — EDIT MODE ═══ */}
      {step === "input" && mode === "edit" && (
        <div className="input-step" role="region" aria-label="Resume input">
          <div className="input-hero">
            <h2>Edit Your Resume</h2>
            <p>
              Paste your resume text or upload a PDF. We'll parse it with AI
              so you can edit it in our live preview editor.
            </p>
          </div>
          <div className="input-grid input-grid-single">
            <div className="input-card">
              <div className="input-label-row">
                <label className="input-label">
                  <FileText size={16} />
                  Your Resume
                </label>
                <div className="upload-actions">
                  {uploadedFileName && (
                    <span className="uploaded-file">
                      <FileUp size={12} />
                      {uploadedFileName}
                      <button
                        className="clear-upload"
                        onClick={handleClearUpload}
                        aria-label="Clear upload"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  )}
                  <label
                    className={`upload-btn ${isPdfLoading ? "disabled" : ""}`}
                    aria-disabled={isPdfLoading}
                  >
                    <Upload size={13} />
                    {isPdfLoading ? "Processing..." : "Upload PDF"}
                    {!isPdfLoading && (
                      <input
                        ref={pdfInputRef}
                        type="file"
                        accept=".pdf"
                        onChange={handlePdfUpload}
                        hidden
                        aria-label="Upload PDF"
                      />
                    )}
                  </label>
                </div>
              </div>
              {isPdfLoading ? (
                <div className="pdf-loading">
                  <div className="loading-progress-number">
                    {pdfLoadPercent}%
                  </div>
                  <div className="loading-progress-track" aria-hidden="true">
                    <div
                      className="loading-progress-fill"
                      style={{ width: `${pdfLoadPercent}%` }}
                    />
                  </div>
                  <span>
                    {loadingMessage || "Extracting text from PDF..."}
                  </span>
                </div>
              ) : (
                <>
                  <textarea
                    className="input-textarea"
                    placeholder="Paste your full resume text here or upload a PDF..."
                    value={resumeText}
                    maxLength={LIMITS.MAX_RESUME_TEXT_LENGTH}
                    onChange={(e) => {
                      setResumeText(e.target.value);
                      if (uploadedFileName) setUploadedFileName(null);
                    }}
                    aria-label="Resume text"
                  />
                  <small className="char-count">
                    {resumeText.length.toLocaleString()} /{" "}
                    {LIMITS.MAX_RESUME_TEXT_LENGTH.toLocaleString()}
                  </small>
                </>
              )}
            </div>
          </div>

          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div
            className={`input-actions-row ${useStickyMobileActions ? "input-actions-row-sticky" : ""}`}
          >
            <button className="btn-secondary" onClick={handleBackToLanding}>
              Back
            </button>
            <button
              className="analyze-btn"
              onClick={handleParseResume}
              disabled={!resumeText.trim() || isAnalyzeCoolingDown}
            >
              {isAnalyzeCoolingDown ? (
                <>
                  <Clock size={18} />
                  Wait {formatCooldown(analyzeCooldownRemaining)}
                </>
              ) : (
                <>
                  <Edit3 size={18} />
                  Parse & Edit
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
export default InputScreen;
