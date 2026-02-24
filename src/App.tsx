import { useState, useRef, useEffect, useCallback } from "react";
import { useReactToPrint } from "react-to-print";
import {
  useUser,
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from "@clerk/clerk-react";
import ResumeTemplate from "./components/ResumeTemplate";
import ResumeEditor from "./components/ResumeEditor";
import { DEFAULT_AI_SETTINGS } from "./types/aiSettings";
import type { ResumeData } from "./types/resume";
import type { ATSResult, OptimizeProgress } from "./utils/aiService";
import {
  parseResumeFromText,
  analyzeATSScore,
  optimizeResumeLoop,
} from "./utils/aiService";
import { extractTextFromPDF } from "./utils/pdfExtractor";
import { loadResume, saveResume } from "./services/resumeService";
import {
  FileText,
  Upload,
  Search,
  Download,
  Edit3,
  Zap,
  RotateCcw,
  AlertCircle,
  Loader2,
  Trophy,
  Target,
  ChevronRight,
  Save,
  FileUp,
  X,
  LogIn,
} from "lucide-react";
import "./App.css";

type AppStep = "input" | "analyzing" | "score" | "editor";

/* ─── Score Visualization Components ─────────────────── */

function ScoreMeter({ score, size = 160 }: { score: number; size?: number }) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div className="score-meter">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="score-meter-text">
        <span className="score-number" style={{ color }}>
          {score}
        </span>
        <span className="score-label">/ 100</span>
      </div>
    </div>
  );
}

function BreakdownBar({
  label,
  score,
  weight,
}: {
  label: string;
  score: number;
  weight: number;
}) {
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div className="breakdown-bar">
      <div className="breakdown-info">
        <span className="breakdown-label">{label}</span>
        <span className="breakdown-score">
          {score}/100 <small>({weight}%)</small>
        </span>
      </div>
      <div className="breakdown-track">
        <div
          className="breakdown-fill"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
    </div>
  );
}

/* ─── Main App ─────────────────────────────────────────── */

function App() {
  const { user, isLoaded: isUserLoaded } = useUser();
  const [step, setStep] = useState<AppStep>("input");
  const [resumeText, setResumeText] = useState("");
  const [jdText, setJdText] = useState("");
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const [atsResult, setATSResult] = useState<ATSResult | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeProgress, setOptimizeProgress] =
    useState<OptimizeProgress | null>(null);
  const [previousScore, setPreviousScore] = useState<number | null>(null);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [optimizeDone, setOptimizeDone] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDbLoading, setIsDbLoading] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const aiSettings = DEFAULT_AI_SETTINGS;
  const resumeRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Auto-load from Supabase when user signs in ──── */
  useEffect(() => {
    if (!user?.id) return;
    setIsDbLoading(true);
    loadResume(user.id)
      .then((saved) => {
        if (saved) {
          setResumeData(saved);
          setStep("editor");
        }
      })
      .catch((err) => {
        console.error("Supabase load failed:", err);
        setError(
          "Failed to load saved resume from database. Check console for details.",
        );
      })
      .finally(() => setIsDbLoading(false));
  }, [user?.id]);

  /* ── Auto-save to Supabase on resumeData changes ── */
  const autoSave = useCallback(
    (data: ResumeData) => {
      if (!user?.id) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        setIsSaving(true);
        saveResume(user.id, data)
          .then((ok) => {
            if (!ok) console.warn("Supabase save returned false");
          })
          .catch((err) => {
            console.error("Supabase save failed:", err);
          })
          .finally(() => setIsSaving(false));
      }, 2000);
    },
    [user?.id],
  );

  const handleResumeChange = (data: ResumeData) => {
    setResumeData(data);
    autoSave(data);
  };

  const handlePrint = useReactToPrint({
    contentRef: resumeRef,
    documentTitle: resumeData
      ? `${resumeData.contact.name.replace(/\s+/g, "_")}_Resume`
      : "Resume",
  });

  /* ── PDF Upload ──────────────────────────────────────── */

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Please upload a PDF file.");
      return;
    }
    setIsPdfLoading(true);
    setError(null);
    try {
      const text = await extractTextFromPDF(file);
      if (!text.trim()) {
        throw new Error(
          "Could not extract text from this PDF. It may be image-based. Try pasting the text manually.",
        );
      }
      setResumeText(text);
      setUploadedFileName(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read PDF");
    } finally {
      setIsPdfLoading(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  };

  const handleClearUpload = () => {
    setResumeText("");
    setUploadedFileName(null);
  };

  /* ── Step 1 → Analyzing ─────────────────────────────── */

  const handleAnalyze = async () => {
    if (!resumeText.trim() || !jdText.trim()) return;
    setStep("analyzing");
    setError(null);
    setLoadingMessage("Parsing your resume with AI...");

    try {
      const parsed = await parseResumeFromText(aiSettings, resumeText);
      handleResumeChange(parsed);

      setLoadingMessage("Running ATS analysis...");
      const ats = await analyzeATSScore(aiSettings, parsed, jdText);
      setATSResult(ats);
      setOptimizeDone(false);
      setPreviousScore(null);
      setStep("score");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setStep("input");
    }
  };

  /* ── Optimize (in-place on score step) ──────────────── */

  const handleOptimize = async () => {
    if (!resumeData || !atsResult) return;
    setIsOptimizing(true);
    setOptimizeDone(false);
    setPreviousScore(atsResult.overallScore);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await optimizeResumeLoop(
        aiSettings,
        resumeData,
        jdText,
        95,
        5,
        (p) => setOptimizeProgress({ ...p }),
        controller.signal,
      );

      if (result.finalResume) {
        handleResumeChange(result.finalResume);
        const newAts = await analyzeATSScore(
          aiSettings,
          result.finalResume,
          jdText,
        );
        setATSResult(newAts);
      }
      setOptimizeDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Optimization failed");
    } finally {
      setIsOptimizing(false);
      abortRef.current = null;
    }
  };

  const handleStopOptimize = () => {
    abortRef.current?.abort();
  };

  /* ── Navigation ─────────────────────────────────────── */

  const handleEdit = () => setStep("editor");

  const handleReAnalyze = async () => {
    if (!resumeData) return;
    setStep("analyzing");
    setError(null);
    setLoadingMessage("Re-analyzing with ATS...");
    setOptimizeDone(false);
    setPreviousScore(null);

    try {
      const ats = await analyzeATSScore(aiSettings, resumeData, jdText);
      setATSResult(ats);
      setStep("score");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-analysis failed");
      setStep("editor");
    }
  };

  const handleStartOver = () => {
    setStep("input");
    setResumeData(null);
    setATSResult(null);
    setOptimizeProgress(null);
    setError(null);
    setPreviousScore(null);
    setOptimizeDone(false);
    setIsOptimizing(false);
    setUploadedFileName(null);
    setJdText("");
    setResumeText("");
  };

  /* ── New JD (keep existing resume) ───────────────── */

  const handleNewJD = () => {
    setJdText("");
    setATSResult(null);
    setOptimizeProgress(null);
    setError(null);
    setPreviousScore(null);
    setOptimizeDone(false);
    setIsOptimizing(false);
    setStep("input");
  };

  const handleAnalyzeExisting = async () => {
    if (!resumeData || !jdText.trim()) return;
    setStep("analyzing");
    setError(null);
    setLoadingMessage("Running ATS analysis against new JD...");

    try {
      const ats = await analyzeATSScore(aiSettings, resumeData, jdText);
      setATSResult(ats);
      setOptimizeDone(false);
      setPreviousScore(null);
      setStep("score");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setStep("input");
    }
  };

  const handleSaveJSON = () => {
    if (!resumeData) return;
    const blob = new Blob([JSON.stringify(resumeData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "resume-data.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadJSON = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target?.result as string) as ResumeData;
            handleResumeChange(data);
            setStep("editor");
          } catch {
            alert("Invalid JSON file");
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  /* ─── Render ─────────────────────────────────────────── */

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <FileText size={22} className="logo-icon" />
          <h1 className="app-title">Resume Maker</h1>
        </div>
        <div className="header-actions">
          {isSaving && <span className="save-indicator">Saving...</span>}
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
          {step !== "input" && step !== "analyzing" && (
            <button className="header-btn" onClick={handleStartOver}>
              <RotateCcw size={14} />
              Start Over
            </button>
          )}
          {step === "score" && (
            <button
              className="header-btn btn-primary"
              onClick={() => handlePrint()}
            >
              <Download size={14} />
              Export PDF
            </button>
          )}
          {step === "editor" && (
            <>
              <button className="header-btn btn-accent" onClick={handleNewJD}>
                <Target size={14} />
                New JD
              </button>
              <button className="header-btn" onClick={handleLoadJSON}>
                <Upload size={14} />
                Load JSON
              </button>
              <button className="header-btn" onClick={handleSaveJSON}>
                <Save size={14} />
                Save JSON
              </button>
              <button className="header-btn" onClick={handleReAnalyze}>
                <Search size={14} />
                Re-Analyze
              </button>
              <button
                className="header-btn btn-primary"
                onClick={() => handlePrint()}
              >
                <Download size={14} />
                Export PDF
              </button>
            </>
          )}
        </div>
      </header>

      {/* Step Indicator */}
      {step !== "analyzing" && (
        <div className="step-indicator">
          <div
            className={`step-item ${step === "input" ? "active" : "completed"}`}
          >
            <div className="step-number">1</div>
            <span>Input</span>
          </div>
          <ChevronRight size={16} className="step-arrow" />
          <div
            className={`step-item ${step === "score" ? "active" : step === "editor" ? "completed" : ""}`}
          >
            <div className="step-number">2</div>
            <span>ATS Score</span>
          </div>
          <ChevronRight size={16} className="step-arrow" />
          <div className={`step-item ${step === "editor" ? "active" : ""}`}>
            <div className="step-number">3</div>
            <span>Editor</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="app-main">
        <SignedOut>
          <div className="auth-gate">
            <div className="auth-card">
              <FileText size={48} className="auth-icon" />
              <h2>Welcome to Resume Maker</h2>
              <p>
                Sign in to analyze, optimize, and manage your resumes with AI.
              </p>
              <SignInButton mode="modal">
                <button className="auth-signin-btn">
                  <LogIn size={18} />
                  Sign In to Get Started
                </button>
              </SignInButton>
            </div>
          </div>
        </SignedOut>

        <SignedIn>
          {isDbLoading && (
            <div className="analyzing-step">
              <Loader2 size={48} className="spin" />
              <h2>Loading your saved resume...</h2>
            </div>
          )}

          {!isDbLoading && (
            <>
              {/* ═══ INPUT STEP ═══ */}
              {step === "input" && (
                <div className="input-step">
                  <div className="input-hero">
                    <h2>
                      {resumeData
                        ? "Analyze Against a New Job Description"
                        : "Analyze & Optimize Your Resume"}
                    </h2>
                    <p>
                      {resumeData
                        ? "Your saved resume will be used. Just paste the new job description below."
                        : "Paste your resume and the job description to get an ATS score, keyword analysis, and AI-powered optimization."}
                    </p>
                  </div>
                  <div
                    className={
                      resumeData ? "input-grid input-grid-single" : "input-grid"
                    }
                  >
                    {!resumeData && (
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
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            )}
                            <label className="upload-btn">
                              <Upload size={13} />
                              Upload PDF
                              <input
                                ref={pdfInputRef}
                                type="file"
                                accept=".pdf"
                                onChange={handlePdfUpload}
                                hidden
                              />
                            </label>
                          </div>
                        </div>
                        {isPdfLoading ? (
                          <div className="pdf-loading">
                            <Loader2 size={24} className="spin" />
                            <span>Extracting text from PDF...</span>
                          </div>
                        ) : (
                          <textarea
                            className="input-textarea"
                            placeholder="Paste your full resume text here or upload a PDF..."
                            value={resumeText}
                            onChange={(e) => {
                              setResumeText(e.target.value);
                              if (uploadedFileName) setUploadedFileName(null);
                            }}
                          />
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
                        placeholder="Paste the job description here..."
                        value={jdText}
                        onChange={(e) => setJdText(e.target.value)}
                      />
                    </div>
                  </div>
                  {error && (
                    <div className="error-banner">
                      <AlertCircle size={16} />
                      {error}
                    </div>
                  )}
                  {resumeData ? (
                    <div className="input-actions-row">
                      <button
                        className="analyze-btn"
                        onClick={handleAnalyzeExisting}
                        disabled={!jdText.trim()}
                      >
                        <Search size={18} />
                        Analyze with New JD
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => setStep("editor")}
                      >
                        Back to Editor
                      </button>
                    </div>
                  ) : (
                    <button
                      className="analyze-btn"
                      onClick={handleAnalyze}
                      disabled={!resumeText.trim() || !jdText.trim()}
                    >
                      <Search size={18} />
                      Analyze Resume
                    </button>
                  )}
                </div>
              )}

              {/* ═══ ANALYZING STEP ═══ */}
              {step === "analyzing" && (
                <div className="analyzing-step">
                  <Loader2 size={48} className="spin" />
                  <h2>{loadingMessage}</h2>
                  <p>This may take a moment...</p>
                </div>
              )}

              {/* ═══ SCORE STEP ═══ */}
              {step === "score" && atsResult && resumeData && (
                <div className="score-step">
                  <div className="score-left">
                    {/* Score Header */}
                    <div className="score-header">
                      <ScoreMeter score={atsResult.overallScore} />
                      <div className="score-verdict">
                        <h3>ATS Score</h3>
                        <p>{atsResult.summaryVerdict}</p>
                        {optimizeDone && previousScore !== null && (
                          <div className="improvement-badge">
                            <Trophy size={16} />
                            Improved: {previousScore} &rarr;{" "}
                            {atsResult.overallScore}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Keywords */}
                    <div className="keywords-section">
                      <h4>Keywords Found</h4>
                      <div className="keyword-tags">
                        {atsResult.breakdown.keywordMatch.matchedKeywords?.map(
                          (k) => (
                            <span key={k} className="tag tag-match">
                              {k}
                            </span>
                          ),
                        )}
                        {atsResult.breakdown.skillsAlignment.matchedSkills?.map(
                          (k) => (
                            <span key={`s-${k}`} className="tag tag-match">
                              {k}
                            </span>
                          ),
                        )}
                      </div>
                      <h4>Missing Keywords</h4>
                      <div className="keyword-tags">
                        {atsResult.breakdown.keywordMatch.missingKeywords?.map(
                          (k) => (
                            <span key={k} className="tag tag-missing">
                              {k}
                            </span>
                          ),
                        )}
                        {atsResult.breakdown.skillsAlignment.missingSkills?.map(
                          (k) => (
                            <span key={`s-${k}`} className="tag tag-missing">
                              {k}
                            </span>
                          ),
                        )}
                      </div>
                    </div>

                    {/* Breakdown */}
                    <div className="breakdown-section">
                      <h4>Breakdown</h4>
                      <BreakdownBar
                        label="Keyword Match"
                        score={atsResult.breakdown.keywordMatch.score}
                        weight={atsResult.breakdown.keywordMatch.weight}
                      />
                      <BreakdownBar
                        label="Skills Alignment"
                        score={atsResult.breakdown.skillsAlignment.score}
                        weight={atsResult.breakdown.skillsAlignment.weight}
                      />
                      <BreakdownBar
                        label="Experience Relevance"
                        score={atsResult.breakdown.experienceRelevance.score}
                        weight={atsResult.breakdown.experienceRelevance.weight}
                      />
                      <BreakdownBar
                        label="Formatting"
                        score={atsResult.breakdown.formatting.score}
                        weight={atsResult.breakdown.formatting.weight}
                      />
                      <BreakdownBar
                        label="Impact & Metrics"
                        score={atsResult.breakdown.impact.score}
                        weight={atsResult.breakdown.impact.weight}
                      />
                    </div>

                    {/* Suggestions */}
                    {atsResult.topSuggestions.length > 0 && (
                      <div className="suggestions-section">
                        <h4>Suggestions</h4>
                        <ul>
                          {atsResult.topSuggestions.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Error */}
                    {error && (
                      <div className="error-banner">
                        <AlertCircle size={16} />
                        {error}
                      </div>
                    )}

                    {/* Optimize Progress */}
                    {isOptimizing && optimizeProgress && (
                      <div className="optimize-progress">
                        <div className="optimize-header">
                          <Loader2 size={18} className="spin" />
                          <span>{optimizeProgress.message}</span>
                        </div>
                        <div className="optimize-timeline">
                          {optimizeProgress.history.map((h) => (
                            <div key={h.iteration} className="timeline-item">
                              <div className="timeline-dot" />
                              <span>
                                Iteration {h.iteration}: Score{" "}
                                {h.atsResult.overallScore}/100
                              </span>
                            </div>
                          ))}
                        </div>
                        <button
                          className="btn-secondary"
                          onClick={handleStopOptimize}
                        >
                          Stop
                        </button>
                      </div>
                    )}

                    {/* Actions */}
                    {!isOptimizing && (
                      <div className="score-actions">
                        <button
                          className="btn-optimize"
                          onClick={handleOptimize}
                        >
                          <Zap size={18} />
                          {optimizeDone ? "Re-Optimize" : "Optimize Resume"}
                        </button>
                        <button className="btn-edit" onClick={handleEdit}>
                          <Edit3 size={18} />
                          {optimizeDone ? "Edit Resume" : "Edit Manually"}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="score-right">
                    <div className="preview-container">
                      <ResumeTemplate ref={resumeRef} data={resumeData} />
                    </div>
                  </div>
                </div>
              )}

              {/* ═══ EDITOR STEP ═══ */}
              {step === "editor" && resumeData && (
                <div className="editor-step">
                  <div className="editor-left">
                    <ResumeEditor
                      data={resumeData}
                      onChange={handleResumeChange}
                    />
                  </div>
                  <div className="editor-right">
                    <div className="preview-container">
                      <ResumeTemplate ref={resumeRef} data={resumeData} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </SignedIn>
      </main>
    </div>
  );
}

export default App;
