import React, { useState, useRef } from "react";
import { useAppStore } from "../store/appStore";
import { generateCoverLetter } from "../utils/coverLetterService";
import { FileText, Loader2, Copy, Download, X, Sparkles } from "lucide-react";
import "./CoverLetter.css";

interface CoverLetterPanelProps {
  onClose: () => void;
}

const CoverLetterPanel: React.FC<CoverLetterPanelProps> = ({ onClose }) => {
  const resumeData = useAppStore((s) => s.resumeData);
  const jdText = useAppStore((s) => s.jdText);
  const aiSettings = useAppStore((s) => s.aiSettings);
  const coverLetter = useAppStore((s) => s.coverLetter);
  const setCoverLetter = useAppStore((s) => s.setCoverLetter);
  const isGenerating = useAppStore((s) => s.isGeneratingCoverLetter);
  const setIsGenerating = useAppStore((s) => s.setIsGeneratingCoverLetter);

  const [companyName, setCompanyName] = useState(
    coverLetter?.companyName || "",
  );
  const [position, setPosition] = useState(coverLetter?.position || "");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleGenerate = async () => {
    if (!resumeData || !jdText.trim()) {
      setError("Resume data and job description are required.");
      return;
    }
    if (!companyName.trim() || !position.trim()) {
      setError("Please enter the company name and position.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resumeText = JSON.stringify(resumeData);
      const content = await generateCoverLetter(
        {
          aiSettings,
          resumeText,
          jobDescription: jdText,
          companyName: companyName.trim(),
          position: position.trim(),
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setCoverLetter({
        content,
        companyName: companyName.trim(),
        position: position.trim(),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(
        err instanceof Error ? err.message : "Failed to generate cover letter",
      );
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setIsGenerating(false);
  };

  const handleCopy = async () => {
    if (coverLetter?.content) {
      await navigator.clipboard.writeText(coverLetter.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (!coverLetter?.content) return;
    const blob = new Blob([coverLetter.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Cover_Letter_${companyName.replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="cl-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Cover Letter Generator"
    >
      <div className="cl-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cl-header">
          <h3>
            <FileText size={18} /> Cover Letter Generator
          </h3>
          <button className="cl-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="cl-inputs">
          <div className="cl-field">
            <label>Company Name</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g., Google"
              disabled={isGenerating}
            />
          </div>
          <div className="cl-field">
            <label>Position</label>
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="e.g., Software Engineer"
              disabled={isGenerating}
            />
          </div>
        </div>

        <div className="cl-actions-row">
          <button
            className="cl-generate-btn"
            onClick={handleGenerate}
            disabled={isGenerating || !companyName.trim() || !position.trim()}
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} className="spin" /> Generating...
              </>
            ) : (
              <>
                <Sparkles size={16} /> Generate Cover Letter
              </>
            )}
          </button>
          {isGenerating && (
            <button
              className="cl-cancel-btn"
              onClick={handleCancel}
              type="button"
            >
              <X size={16} /> Cancel
            </button>
          )}
        </div>

        {error && <div className="cl-error">{error}</div>}

        {coverLetter?.content && (
          <div className="cl-result">
            <div className="cl-result-actions">
              <button onClick={handleCopy} className="cl-action-btn">
                <Copy size={14} /> {copied ? "Copied!" : "Copy"}
              </button>
              <button onClick={handleDownload} className="cl-action-btn">
                <Download size={14} /> Download
              </button>
            </div>
            <div className="cl-content">{coverLetter.content}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CoverLetterPanel;
