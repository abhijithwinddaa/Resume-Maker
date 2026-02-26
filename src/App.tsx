import {
  useRef,
  useEffect,
  useCallback,
  memo,
  lazy,
  Suspense,
  useState,
} from "react";
import { useReactToPrint } from "react-to-print";
import {
  useUser,
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from "@clerk/clerk-react";
import { useAppStore } from "./store/appStore";
import type { ResumeData } from "./types/resume";
import {
  parseResumeFromText,
  analyzeATSScore,
  optimizeResumeLoop,
  selfATSScore,
  selfOptimizeLoop,
} from "./utils/aiService";
import { detectTemplateStyle } from "./utils/templateDetector";
import { extractTextFromPDF } from "./utils/pdfExtractorWorker";
import { loadResume, saveResume } from "./services/resumeService";
import {
  isRateLimited,
  getRateLimitRemaining,
  recordAction,
  formatCooldown,
} from "./utils/rateLimiter";
import {
  validatePDFFile,
  validateResumeText,
  validateJDText,
  sanitizeText,
  LIMITS,
} from "./utils/inputValidation";
import {
  saveLocalBackup,
  loadLocalBackup,
  formatBackupAge,
} from "./utils/localBackup";
import {
  getRequestController,
  clearRequestController,
} from "./utils/requestDedup";
import { useDebounce } from "./hooks/useDebounce";
import { validateResumeData } from "./utils/zodSchemas";
import { exportToDocx } from "./utils/docxExporter";
import ErrorBoundary from "./components/ErrorBoundary";
import { EditorSkeleton, PreviewSkeleton } from "./components/Skeleton";
import ThemeToggle from "./components/ThemeToggle";
import LanguageSwitcher from "./components/LanguageSwitcher";
import StyleDetectedBadge from "./components/StyleDetectedBadge";
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
  Clock,
  HardDrive,
  Undo2,
  Redo2,
  Palette,
  Settings,
  FileType,
  Mail,
  FolderOpen,
  Eye,
} from "lucide-react";
import "./App.css";

/* ─── Lazy-loaded heavy components ─────────────────── */
const ResumeTemplate = lazy(() => import("./components/ResumeTemplate"));
const ResumeEditor = lazy(() => import("./components/ResumeEditor"));
const TemplatePicker = lazy(() => import("./components/TemplatePicker"));
const CoverLetterPanel = lazy(() => import("./components/CoverLetter"));
const AISettingsPanel = lazy(() => import("./components/AISettings"));
const ResumeManagerPanel = lazy(() => import("./components/ResumeManager"));
const PdfPreviewPanel = lazy(() => import("./components/PdfPreview"));

/* ─── Score Visualization Components ─────────────────── */

const ScoreMeter = memo(function ScoreMeter({
  score,
  size = 160,
}: {
  score: number;
  size?: number;
}) {
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
});

const BreakdownBar = memo(function BreakdownBar({
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
});

/* ─── Main App ─────────────────────────────────────────── */

function App() {
  const { user } = useUser();

  // Zustand store
  const step = useAppStore((s) => s.step);
  const setStep = useAppStore((s) => s.setStep);
  const resumeText = useAppStore((s) => s.resumeText);
  const setResumeText = useAppStore((s) => s.setResumeText);
  const jdText = useAppStore((s) => s.jdText);
  const setJdText = useAppStore((s) => s.setJdText);
  const resumeData = useAppStore((s) => s.resumeData);
  const setResumeData = useAppStore((s) => s.setResumeData);
  const atsResult = useAppStore((s) => s.atsResult);
  const setATSResult = useAppStore((s) => s.setATSResult);
  const isOptimizing = useAppStore((s) => s.isOptimizing);
  const setIsOptimizing = useAppStore((s) => s.setIsOptimizing);
  const optimizeProgress = useAppStore((s) => s.optimizeProgress);
  const setOptimizeProgress = useAppStore((s) => s.setOptimizeProgress);
  const previousScore = useAppStore((s) => s.previousScore);
  const setPreviousScore = useAppStore((s) => s.setPreviousScore);
  const loadingMessage = useAppStore((s) => s.loadingMessage);
  const setLoadingMessage = useAppStore((s) => s.setLoadingMessage);
  const error = useAppStore((s) => s.error);
  const setError = useAppStore((s) => s.setError);
  const optimizeDone = useAppStore((s) => s.optimizeDone);
  const setOptimizeDone = useAppStore((s) => s.setOptimizeDone);
  const uploadedFileName = useAppStore((s) => s.uploadedFileName);
  const setUploadedFileName = useAppStore((s) => s.setUploadedFileName);
  const isPdfLoading = useAppStore((s) => s.isPdfLoading);
  const setIsPdfLoading = useAppStore((s) => s.setIsPdfLoading);
  const isSaving = useAppStore((s) => s.isSaving);
  const setIsSaving = useAppStore((s) => s.setIsSaving);
  const isDbLoading = useAppStore((s) => s.isDbLoading);
  const setIsDbLoading = useAppStore((s) => s.setIsDbLoading);
  const setCooldownRemaining = useAppStore((s) => s.setCooldownRemaining);
  const hasBackup = useAppStore((s) => s.hasBackup);
  const setHasBackup = useAppStore((s) => s.setHasBackup);
  const aiSettings = useAppStore((s) => s.aiSettings);
  const startOver = useAppStore((s) => s.startOver);
  const newJD = useAppStore((s) => s.newJD);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const canUndo = useAppStore((s) => s.canUndo);
  const canRedo = useAppStore((s) => s.canRedo);
  const setDetectedStyle = useAppStore((s) => s.setDetectedStyle);
  const setOriginalPdfUrl = useAppStore((s) => s.setOriginalPdfUrl);
  const originalPdfUrl = useAppStore((s) => s.originalPdfUrl);
  const showOriginalPdf = useAppStore((s) => s.showOriginalPdf);
  const setShowOriginalPdf = useAppStore((s) => s.setShowOriginalPdf);
  const applyDetectedStyle = useAppStore((s) => s.applyDetectedStyle);

  // Panel visibility
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showCoverLetter, setShowCoverLetter] = useState(false);
  const [showAISettings, setShowAISettings] = useState(false);
  const [showResumeManager, setShowResumeManager] = useState(false);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const resumeRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* ── Keyboard shortcuts (Ctrl+Z / Ctrl+Y) ────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
          e.preventDefault();
          redo();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  /* ── Cooldown timer tick ──────────────────────────── */
  useEffect(() => {
    const interval = setInterval(() => {
      const analyzeRemaining = getRateLimitRemaining("analyze", 30000);
      const optimizeRemaining = getRateLimitRemaining("optimize", 30000);
      setCooldownRemaining(Math.max(analyzeRemaining, optimizeRemaining));
    }, 1000);
    return () => clearInterval(interval);
  }, [setCooldownRemaining]);

  /* ── Check for local backup on mount ────────────── */
  useEffect(() => {
    const backup = loadLocalBackup();
    setHasBackup(!!backup);
  }, [setHasBackup]);

  /* ── Auto-load from Supabase when user signs in ──── */
  useEffect(() => {
    if (!user?.id) return;
    setIsDbLoading(true);
    loadResume(user.id)
      .then((saved) => {
        if (saved) {
          setResumeData(saved, false);
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
  }, [user?.id, setIsDbLoading, setResumeData, setStep, setError]);

  /* ── Debounced auto-save to Supabase (500ms) ────── */
  const debouncedSupabaseSave = useDebounce((data: ResumeData) => {
    if (!user?.id) return;
    setIsSaving(true);
    saveResume(user.id, data)
      .then((ok) => {
        if (!ok) console.warn("Supabase save returned false");
      })
      .catch((err) => {
        console.error("Supabase save failed:", err);
      })
      .finally(() => setIsSaving(false));
  }, 500);

  const handleResumeChange = useCallback(
    (data: ResumeData) => {
      setResumeData(data);
      debouncedSupabaseSave(data);
      saveLocalBackup(data, jdText);
    },
    [setResumeData, debouncedSupabaseSave, jdText],
  );

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

    const validation = validatePDFFile(file);
    if (!validation.valid) {
      setError(validation.error || "Invalid file.");
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
      setResumeText(sanitizeText(text));
      setUploadedFileName(file.name);

      // Store original PDF as blob URL for side-by-side preview
      const pdfBlobUrl = URL.createObjectURL(file);
      setOriginalPdfUrl(pdfBlobUrl);

      // Run template style detection in background (non-blocking)
      detectTemplateStyle(aiSettings, sanitizeText(text))
        .then((detected) => {
          setDetectedStyle(detected);
          // Auto-apply the detected style if confidence is high enough
          if (detected.confidence >= 50) {
            // Apply style to store — this updates template + customization
            const { templateId, customization } = detected;
            const store = useAppStore.getState();
            store.setTemplateId(templateId);
            store.setCustomization(customization);
          }
        })
        .catch((err) => {
          console.warn("Template detection failed (non-critical):", err);
        });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read PDF");
    } finally {
      setIsPdfLoading(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  };

  const handleClearUpload = useCallback(() => {
    setResumeText("");
    setUploadedFileName(null);
    setDetectedStyle(null);
    setOriginalPdfUrl(null);
  }, [setResumeText, setUploadedFileName, setDetectedStyle, setOriginalPdfUrl]);

  /* ── Quick Edit (no JD required) ─────────────────────── */

  const handleQuickEdit = async () => {
    if (!resumeText.trim()) return;

    const resumeValidation = validateResumeText(resumeText);
    if (!resumeValidation.valid) {
      setError(resumeValidation.error || "Invalid resume text.");
      return;
    }

    if (isRateLimited("analyze", 30000)) {
      const remaining = getRateLimitRemaining("analyze", 30000);
      setError(
        `Please wait ${formatCooldown(remaining)} before analyzing again.`,
      );
      return;
    }

    setStep("analyzing");
    setError(null);
    setLoadingMessage("Parsing your resume with AI...");
    recordAction("analyze");

    const controller = getRequestController("quick-edit");

    try {
      if (controller.signal.aborted) return;
      const parsed = await parseResumeFromText(
        aiSettings,
        sanitizeText(resumeText),
      );
      if (controller.signal.aborted) return;
      handleResumeChange(parsed);
      setStep("editor");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Parsing failed");
      setStep("input");
    } finally {
      clearRequestController("quick-edit");
    }
  };

  /* ── Self ATS Score (no JD) ─────────────────────────── */

  const handleSelfScore = async () => {
    if (!resumeData) return;

    if (isRateLimited("analyze", 30000)) {
      const remaining = getRateLimitRemaining("analyze", 30000);
      setError(
        `Please wait ${formatCooldown(remaining)} before scoring again.`,
      );
      return;
    }

    setStep("analyzing");
    setError(null);
    setLoadingMessage("Running self ATS analysis...");
    recordAction("analyze");

    try {
      const ats = await selfATSScore(aiSettings, resumeData);
      setATSResult(ats);
      setOptimizeDone(false);
      setPreviousScore(null);
      setStep("score");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Self scoring failed");
      setStep("editor");
    }
  };

  /* ── Self Optimize (no JD) ──────────────────────────── */

  const handleSelfOptimize = async () => {
    if (!resumeData || !atsResult) return;

    if (isRateLimited("optimize", 30000)) {
      const remaining = getRateLimitRemaining("optimize", 30000);
      setError(
        `Please wait ${formatCooldown(remaining)} before optimizing again.`,
      );
      return;
    }

    setIsOptimizing(true);
    setOptimizeDone(false);
    setPreviousScore(atsResult.overallScore);
    setError(null);
    recordAction("optimize");

    const controller = getRequestController("self-optimize");
    abortRef.current = controller;

    try {
      const result = await selfOptimizeLoop(
        aiSettings,
        resumeData,
        90,
        5,
        (p) => setOptimizeProgress({ ...p }),
        controller.signal,
      );

      if (controller.signal.aborted) return;
      if (result.finalResume) {
        handleResumeChange(result.finalResume);
        const newAts = await selfATSScore(aiSettings, result.finalResume);
        setATSResult(newAts);
      }
      setOptimizeDone(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Optimization failed");
    } finally {
      setIsOptimizing(false);
      abortRef.current = null;
      clearRequestController("self-optimize");
    }
  };

  /* ── Step 1 → Analyzing ─────────────────────────────── */

  const handleAnalyze = async () => {
    if (!resumeText.trim() || !jdText.trim()) return;

    const resumeValidation = validateResumeText(resumeText);
    if (!resumeValidation.valid) {
      setError(resumeValidation.error || "Invalid resume text.");
      return;
    }
    const jdValidation = validateJDText(jdText);
    if (!jdValidation.valid) {
      setError(jdValidation.error || "Invalid job description.");
      return;
    }

    if (isRateLimited("analyze", 30000)) {
      const remaining = getRateLimitRemaining("analyze", 30000);
      setError(
        `Please wait ${formatCooldown(remaining)} before analyzing again.`,
      );
      return;
    }

    setStep("analyzing");
    setError(null);
    setLoadingMessage("Parsing your resume with AI...");
    recordAction("analyze");

    const controller = getRequestController("analyze");

    try {
      if (controller.signal.aborted) return;
      const parsed = await parseResumeFromText(
        aiSettings,
        sanitizeText(resumeText),
      );
      if (controller.signal.aborted) return;
      handleResumeChange(parsed);

      setLoadingMessage("Running ATS analysis...");
      const ats = await analyzeATSScore(
        aiSettings,
        parsed,
        sanitizeText(jdText),
      );
      if (controller.signal.aborted) return;
      setATSResult(ats);
      setOptimizeDone(false);
      setPreviousScore(null);
      setStep("score");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Analysis failed");
      setStep("input");
    } finally {
      clearRequestController("analyze");
    }
  };

  /* ── Optimize ──────────────────────────────────────── */

  const handleOptimize = async () => {
    if (!resumeData || !atsResult) return;

    if (isRateLimited("optimize", 30000)) {
      const remaining = getRateLimitRemaining("optimize", 30000);
      setError(
        `Please wait ${formatCooldown(remaining)} before optimizing again.`,
      );
      return;
    }

    setIsOptimizing(true);
    setOptimizeDone(false);
    setPreviousScore(atsResult.overallScore);
    setError(null);
    recordAction("optimize");

    const controller = getRequestController("optimize");
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

      if (controller.signal.aborted) return;
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
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Optimization failed");
    } finally {
      setIsOptimizing(false);
      abortRef.current = null;
      clearRequestController("optimize");
    }
  };

  const handleStopOptimize = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /* ── Navigation ─────────────────────────────────────── */

  const handleEdit = useCallback(() => setStep("editor"), [setStep]);

  const handleReAnalyze = async () => {
    if (!resumeData) return;
    setStep("analyzing");
    setError(null);
    setLoadingMessage(
      jdText.trim()
        ? "Re-analyzing with ATS..."
        : "Running self ATS analysis...",
    );
    setOptimizeDone(false);
    setPreviousScore(null);

    try {
      const ats = jdText.trim()
        ? await analyzeATSScore(aiSettings, resumeData, jdText)
        : await selfATSScore(aiSettings, resumeData);
      setATSResult(ats);
      setStep("score");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-analysis failed");
      setStep("editor");
    }
  };

  const handleNewJD = useCallback(() => newJD(), [newJD]);
  const handleStartOver = useCallback(() => startOver(), [startOver]);

  const handleAnalyzeExisting = async () => {
    if (!resumeData || !jdText.trim()) return;

    const jdValidation = validateJDText(jdText);
    if (!jdValidation.valid) {
      setError(jdValidation.error || "Invalid job description.");
      return;
    }

    if (isRateLimited("analyze", 30000)) {
      const remaining = getRateLimitRemaining("analyze", 30000);
      setError(
        `Please wait ${formatCooldown(remaining)} before analyzing again.`,
      );
      return;
    }

    setStep("analyzing");
    setError(null);
    setLoadingMessage("Running ATS analysis against new JD...");
    recordAction("analyze");

    const controller = getRequestController("analyze-existing");

    try {
      const ats = await analyzeATSScore(
        aiSettings,
        resumeData,
        sanitizeText(jdText),
      );
      if (controller.signal.aborted) return;
      setATSResult(ats);
      setOptimizeDone(false);
      setPreviousScore(null);
      setStep("score");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Analysis failed");
      setStep("input");
    } finally {
      clearRequestController("analyze-existing");
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
            const raw = JSON.parse(ev.target?.result as string);
            const validation = validateResumeData(raw);
            if (!validation.valid) {
              setError(`Invalid resume JSON: ${validation.errors?.join(", ")}`);
              return;
            }
            handleResumeChange(raw as ResumeData);
            setStep("editor");
          } catch {
            setError("Invalid JSON file. Please check the file format.");
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleExportDocx = async () => {
    if (!resumeData) return;
    try {
      await exportToDocx(resumeData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "DOCX export failed");
    }
  };

  /* ─── Render ─────────────────────────────────────────── */

  return (
    <div className="app">
      {/* Skip Navigation */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Header */}
      <header className="app-header" role="banner">
        <div className="header-left">
          <FileText size={22} className="logo-icon" />
          <h1 className="app-title">Resume Maker</h1>
        </div>
        <div className="header-actions">
          {isSaving && <span className="save-indicator">Saving...</span>}

          {/* Undo/Redo */}
          {step === "editor" && (
            <>
              <button
                className="header-btn"
                onClick={undo}
                disabled={!canUndo()}
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
              >
                <Undo2 size={14} />
              </button>
              <button
                className="header-btn"
                onClick={redo}
                disabled={!canRedo()}
                title="Redo (Ctrl+Y)"
                aria-label="Redo"
              >
                <Redo2 size={14} />
              </button>
            </>
          )}

          <ThemeToggle />
          <LanguageSwitcher />

          <button
            className="header-btn"
            onClick={() => setShowTemplatePicker(true)}
            title="Template & Style"
            aria-label="Template & Style"
          >
            <Palette size={14} />
          </button>

          <button
            className="header-btn"
            onClick={() => setShowAISettings(true)}
            title="AI Settings"
            aria-label="AI Settings"
          >
            <Settings size={14} />
          </button>

          <button
            className="header-btn"
            onClick={() => setShowResumeManager(true)}
            title="My Resumes"
            aria-label="My Resumes"
          >
            <FolderOpen size={14} />
          </button>

          {/* Show Original PDF toggle */}
          {originalPdfUrl && (step === "editor" || step === "score") && (
            <button
              className={`header-btn ${showOriginalPdf ? "btn-accent" : ""}`}
              onClick={() => setShowOriginalPdf(!showOriginalPdf)}
              title={
                showOriginalPdf ? "Hide Original PDF" : "Show Original PDF"
              }
              aria-label={
                showOriginalPdf ? "Hide Original PDF" : "Show Original PDF"
              }
              aria-pressed={showOriginalPdf}
            >
              <Eye size={14} />
              <span>Original</span>
            </button>
          )}

          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>

          {step !== "input" && step !== "analyzing" && (
            <button className="header-btn" onClick={handleStartOver}>
              <RotateCcw size={14} />
              <span>Start Over</span>
            </button>
          )}

          {(step === "score" || step === "editor") && (
            <>
              {step === "editor" && (
                <>
                  <button
                    className="header-btn btn-accent"
                    onClick={handleNewJD}
                  >
                    <Target size={14} />
                    <span>New JD</span>
                  </button>
                  <button className="header-btn" onClick={handleLoadJSON}>
                    <Upload size={14} />
                    <span>Load JSON</span>
                  </button>
                  <button className="header-btn" onClick={handleSaveJSON}>
                    <Save size={14} />
                    <span>Save JSON</span>
                  </button>
                  <button
                    className="header-btn"
                    onClick={handleSelfScore}
                    title="Score resume on general best practices (no JD needed)"
                  >
                    <Trophy size={14} />
                    <span>Self Score</span>
                  </button>
                  <button className="header-btn" onClick={handleReAnalyze}>
                    <Search size={14} />
                    <span>Re-Analyze</span>
                  </button>
                  <button
                    className="header-btn"
                    onClick={() => setShowCoverLetter(true)}
                    title="Generate Cover Letter"
                  >
                    <Mail size={14} />
                    <span>Cover Letter</span>
                  </button>
                </>
              )}
              <button
                className="header-btn"
                onClick={handleExportDocx}
                title="Export as DOCX"
              >
                <FileType size={14} />
                <span>DOCX</span>
              </button>
              <button
                className="header-btn btn-primary"
                onClick={() => handlePrint()}
              >
                <Download size={14} />
                <span>Export PDF</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Live region for status announcements */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        role="status"
      >
        {isSaving && "Saving resume..."}
        {error && `Error: ${error}`}
        {step === "analyzing" && loadingMessage}
      </div>

      {/* Step Indicator */}
      {step !== "analyzing" && (
        <nav className="step-indicator" aria-label="Progress">
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
        </nav>
      )}

      {/* Main Content */}
      <main className="app-main" id="main-content" role="main">
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
                <div
                  className="input-step"
                  role="region"
                  aria-label="Resume input"
                >
                  <div className="input-hero">
                    <h2>
                      {resumeData
                        ? "Analyze Against a New Job Description"
                        : "Analyze & Optimize Your Resume"}
                    </h2>
                    <p>
                      {resumeData
                        ? "Your saved resume will be used. Paste a job description for targeted analysis, or go back to the editor."
                        : "Paste your resume to get started. Add a job description for targeted ATS scoring, or skip it for a general self-assessment."}
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
                                  aria-label="Clear upload"
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
                                aria-label="Upload PDF"
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
                        Job Description{" "}
                        <span className="optional-tag">(Optional)</span>
                      </label>
                      <textarea
                        className="input-textarea"
                        placeholder="Paste the job description here for targeted ATS scoring, or leave empty for a general self-assessment..."
                        value={jdText}
                        maxLength={LIMITS.MAX_JD_LENGTH}
                        onChange={(e) => setJdText(e.target.value)}
                        aria-label="Job description (optional)"
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
                  {resumeData ? (
                    <div className="input-actions-row">
                      {jdText.trim() ? (
                        <button
                          className="analyze-btn"
                          onClick={handleAnalyzeExisting}
                          disabled={isRateLimited("analyze", 30000)}
                        >
                          {isRateLimited("analyze", 30000) ? (
                            <>
                              <Clock size={18} />
                              Wait{" "}
                              {formatCooldown(
                                getRateLimitRemaining("analyze", 30000),
                              )}
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
                          onClick={handleSelfScore}
                          disabled={isRateLimited("analyze", 30000)}
                        >
                          {isRateLimited("analyze", 30000) ? (
                            <>
                              <Clock size={18} />
                              Wait{" "}
                              {formatCooldown(
                                getRateLimitRemaining("analyze", 30000),
                              )}
                            </>
                          ) : (
                            <>
                              <Target size={18} />
                              Self Score
                            </>
                          )}
                        </button>
                      )}
                      <button
                        className="btn-secondary"
                        onClick={() => setStep("editor")}
                      >
                        Back to Editor
                      </button>
                    </div>
                  ) : (
                    <div className="input-actions-row">
                      {jdText.trim() ? (
                        <button
                          className="analyze-btn"
                          onClick={handleAnalyze}
                          disabled={
                            !resumeText.trim() ||
                            isRateLimited("analyze", 30000)
                          }
                        >
                          {isRateLimited("analyze", 30000) ? (
                            <>
                              <Clock size={18} />
                              Wait{" "}
                              {formatCooldown(
                                getRateLimitRemaining("analyze", 30000),
                              )}
                            </>
                          ) : (
                            <>
                              <Search size={18} />
                              Analyze Resume
                            </>
                          )}
                        </button>
                      ) : (
                        <button
                          className="analyze-btn"
                          onClick={handleQuickEdit}
                          disabled={
                            !resumeText.trim() ||
                            isRateLimited("analyze", 30000)
                          }
                        >
                          {isRateLimited("analyze", 30000) ? (
                            <>
                              <Clock size={18} />
                              Wait{" "}
                              {formatCooldown(
                                getRateLimitRemaining("analyze", 30000),
                              )}
                            </>
                          ) : (
                            <>
                              <Edit3 size={18} />
                              Quick Edit
                            </>
                          )}
                        </button>
                      )}
                      {!resumeData && hasBackup && (
                        <button
                          className="btn-secondary backup-restore-btn"
                          onClick={() => {
                            const backup = loadLocalBackup();
                            if (backup) {
                              setResumeData(backup.resumeData, false);
                              if (backup.jdText) setJdText(backup.jdText);
                              setStep("editor");
                            }
                          }}
                        >
                          <HardDrive size={14} />
                          Restore Local Backup
                          <small>
                            (
                            {formatBackupAge(loadLocalBackup()?.timestamp || 0)}
                            )
                          </small>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ═══ ANALYZING STEP ═══ */}
              {step === "analyzing" && (
                <div
                  className="analyzing-step"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 size={48} className="spin" />
                  <h2>{loadingMessage}</h2>
                  <p>This may take a moment...</p>
                </div>
              )}

              {/* ═══ SCORE STEP ═══ */}
              {step === "score" && atsResult && resumeData && (
                <div
                  className="score-step"
                  role="region"
                  aria-label="ATS score results"
                >
                  <div className="score-left">
                    <div className="score-header">
                      <ScoreMeter score={atsResult.overallScore} />
                      <div className="score-verdict">
                        <h3>
                          {jdText.trim() ? "ATS Score" : "Self ATS Score"}
                        </h3>
                        {!jdText.trim() && (
                          <small className="self-score-tag">
                            General best practices — no JD
                          </small>
                        )}
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

                    <div className="keywords-section">
                      <h4>
                        {jdText.trim()
                          ? "Keywords Found"
                          : "Industry Keywords Found"}
                      </h4>
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
                      <h4>
                        {jdText.trim()
                          ? "Missing Keywords"
                          : "Suggested Keywords to Add"}
                      </h4>
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

                    <div className="breakdown-section">
                      <h4>Breakdown</h4>
                      <BreakdownBar
                        label={
                          jdText.trim() ? "Keyword Match" : "Industry Keywords"
                        }
                        score={atsResult.breakdown.keywordMatch.score}
                        weight={atsResult.breakdown.keywordMatch.weight}
                      />
                      <BreakdownBar
                        label={
                          jdText.trim()
                            ? "Skills Alignment"
                            : "Skills Presentation"
                        }
                        score={atsResult.breakdown.skillsAlignment.score}
                        weight={atsResult.breakdown.skillsAlignment.weight}
                      />
                      <BreakdownBar
                        label={
                          jdText.trim()
                            ? "Experience Relevance"
                            : "Content Quality"
                        }
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

                    {error && (
                      <div className="error-banner" role="alert">
                        <AlertCircle size={16} />
                        {error}
                      </div>
                    )}

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

                    {!isOptimizing && (
                      <div className="score-actions">
                        <button
                          className="btn-optimize"
                          onClick={
                            jdText.trim() ? handleOptimize : handleSelfOptimize
                          }
                          disabled={isRateLimited("optimize", 30000)}
                        >
                          {isRateLimited("optimize", 30000) ? (
                            <>
                              <Clock size={18} />
                              Wait{" "}
                              {formatCooldown(
                                getRateLimitRemaining("optimize", 30000),
                              )}
                            </>
                          ) : (
                            <>
                              <Zap size={18} />
                              {optimizeDone
                                ? "Re-Optimize"
                                : jdText.trim()
                                  ? "Optimize Resume"
                                  : "Self Optimize"}
                            </>
                          )}
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
                      <ErrorBoundary>
                        <Suspense fallback={<PreviewSkeleton />}>
                          <ResumeTemplate ref={resumeRef} data={resumeData} />
                        </Suspense>
                      </ErrorBoundary>
                    </div>
                  </div>
                </div>
              )}

              {/* ═══ EDITOR STEP ═══ */}
              {step === "editor" && resumeData && (
                <div
                  className="editor-step"
                  role="region"
                  aria-label="Resume editor"
                >
                  <div className="editor-left">
                    <StyleDetectedBadge />
                    <ErrorBoundary>
                      <Suspense fallback={<EditorSkeleton />}>
                        <ResumeEditor
                          data={resumeData}
                          onChange={handleResumeChange}
                        />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                  <div className="editor-right">
                    <div className="preview-container">
                      <ErrorBoundary>
                        <Suspense fallback={<PreviewSkeleton />}>
                          <ResumeTemplate ref={resumeRef} data={resumeData} />
                        </Suspense>
                      </ErrorBoundary>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </SignedIn>
      </main>

      {/* Modals/Panels */}
      {/* Modal panels — rendered outside main for correct focus trap */}
      {showTemplatePicker && (
        <Suspense fallback={null}>
          <TemplatePicker onClose={() => setShowTemplatePicker(false)} />
        </Suspense>
      )}
      {showCoverLetter && (
        <Suspense fallback={null}>
          <CoverLetterPanel onClose={() => setShowCoverLetter(false)} />
        </Suspense>
      )}
      {showAISettings && (
        <Suspense fallback={null}>
          <AISettingsPanel onClose={() => setShowAISettings(false)} />
        </Suspense>
      )}
      {showResumeManager && (
        <Suspense fallback={null}>
          <ResumeManagerPanel onClose={() => setShowResumeManager(false)} />
        </Suspense>
      )}

      {/* Side panel: original PDF preview */}
      {showOriginalPdf && originalPdfUrl && (
        <Suspense fallback={null}>
          <PdfPreviewPanel onClose={() => setShowOriginalPdf(false)} />
        </Suspense>
      )}
    </div>
  );
}

export default App;
