import {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  memo,
  lazy,
  Suspense,
  useState,
} from "react";
import { exportResumeToPDF } from "./utils/pdfExporter";
import { validateForExport } from "./utils/exportValidation";
import {
  useAuth,
  useUser,
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from "@clerk/clerk-react";
import { useAppStore } from "./store/appStore";
import type { AppMode } from "./store/appStore";
import type { ResumeData } from "./types/resume";
import { createEmptyResume } from "./types/resume";
import {
  parseResumeFromText,
  analyzeATSScore,
  optimizeResumeLoop,
  selfATSScore,
  selfOptimizeLoop,
} from "./utils/aiService";
import type { ResumeFeedbackSignal } from "./utils/resumeFeedback";
import { detectTemplateStyle } from "./utils/templateDetector";
import {
  extractTextAndLinks,
  extractEmbeddedResumeData,
} from "./utils/pdfExtractorWorker";
import { extractTextWithOCR } from "./utils/pdfOcr";
import { loadLatestResume, saveResume } from "./services/resumeService";
import { setSupabaseAccessTokenGetter } from "./lib/supabase";
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
  abortRequestController,
} from "./utils/requestDedup";
import {
  identifyAnalyticsUser,
  trackEvent,
  trackPageView,
} from "./utils/analytics";
import { useDebounce } from "./hooks/useDebounce";
import { validateResumeData } from "./utils/zodSchemas";
import { exportToDocx } from "./utils/docxExporter";
import ErrorBoundary from "./components/ErrorBoundary";
import { EditorSkeleton, PreviewSkeleton } from "./components/Skeleton";
import ThemeToggle from "./components/ThemeToggle";
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
  PlusCircle,
  CheckCircle2,
  AlertTriangle,
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
const CLERK_SUPABASE_TEMPLATE =
  import.meta.env.VITE_CLERK_SUPABASE_TEMPLATE || "";

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

const FeedbackSignalCard = memo(function FeedbackSignalCard({
  signal,
}: {
  signal: ResumeFeedbackSignal;
}) {
  const Icon =
    signal.status === "good"
      ? CheckCircle2
      : signal.status === "warning"
        ? AlertTriangle
        : AlertCircle;

  const statusLabel =
    signal.status === "good"
      ? "Strong"
      : signal.status === "warning"
        ? "Needs work"
        : "High priority";

  return (
    <article className={`feedback-card feedback-card-${signal.status}`}>
      <div className="feedback-card-header">
        <div className="feedback-card-title">
          <Icon size={16} />
          <h5>{signal.title}</h5>
        </div>
        <span className={`feedback-badge feedback-badge-${signal.status}`}>
          {statusLabel}
        </span>
      </div>
      <p>{signal.summary}</p>
      {signal.details.length > 0 && (
        <ul>
          {signal.details.map((detail) => (
            <li key={`${signal.id}-${detail}`}>{detail}</li>
          ))}
        </ul>
      )}
    </article>
  );
});

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getAnalyzeProgressPercent(message: string): number {
  const lowered = message.toLowerCase();
  const ocrMatch = message.match(/page\s+(\d+)\s+of\s+(\d+)/i);
  if (ocrMatch) {
    const page = Number(ocrMatch[1]);
    const total = Number(ocrMatch[2]);
    if (total > 0) {
      return clampPercent(25 + (page / total) * 45);
    }
  }
  if (lowered.includes("image-based pdf")) return 20;
  if (lowered.includes("parsing your resume")) return 48;
  if (lowered.includes("running ats analysis")) return 76;
  if (lowered.includes("running self ats")) return 76;
  if (lowered.includes("running ocr")) return 55;
  return 35;
}

function uniqueStrings(items: string[] = []): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function getOptimizeProgressPercent(
  progress: {
    currentIteration: number;
    maxIterations: number;
    phase: string;
  } | null,
): number {
  if (!progress) return 0;
  const { currentIteration, maxIterations, phase } = progress;
  const completedIterations = Math.max(0, currentIteration - 1);
  const base =
    maxIterations > 0 ? (completedIterations / maxIterations) * 100 : 0;

  if (phase === "target-reached" || phase === "done") return 100;
  if (phase === "error") return clampPercent(base);
  if (phase === "scanning") return clampPercent(base + 15);
  if (phase === "rewriting") return clampPercent(base + 65);
  return clampPercent(base + 10);
}

/* ─── Main App ─────────────────────────────────────────── */

function App() {
  const { getToken } = useAuth();
  const { user } = useUser();

  // Zustand store
  const step = useAppStore((s) => s.step);
  const setStep = useAppStore((s) => s.setStep);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
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
  const privacySettings = useAppStore((s) => s.privacySettings);
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
  const activeResumeId = useAppStore((s) => s.activeResumeId);
  const setActiveResumeId = useAppStore((s) => s.setActiveResumeId);
  const activeResumeName = useAppStore((s) => s.activeResumeName);
  const setActiveResumeName = useAppStore((s) => s.setActiveResumeName);

  // Panel visibility
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showCoverLetter, setShowCoverLetter] = useState(false);
  const [showAISettings, setShowAISettings] = useState(false);
  const [showResumeManager, setShowResumeManager] = useState(false);

  // Save status tracking
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [isAuthStarting, setIsAuthStarting] = useState(false);
  const [isCompactScreen, setIsCompactScreen] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 900px)").matches
      : false,
  );
  const [isMobileKeyboardOpen, setIsMobileKeyboardOpen] = useState(false);
  const [isTextEntryFocused, setIsTextEntryFocused] = useState(false);
  const [showMobileResumePreview, setShowMobileResumePreview] = useState(false);
  const [dbLoadPercent, setDbLoadPercent] = useState(18);
  const [pdfLoadPercent, setPdfLoadPercent] = useState(12);

  // Deferred auth: track which mode was selected before sign-in
  const [pendingMode, setPendingMode] = useState<AppMode>(null);

  // Extracted PDF links for parser
  const extractedLinksRef = useRef<string[]>([]);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const resumeRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const authStartTimeoutRef = useRef<number | null>(null);
  const activeResumeIdRef = useRef<string | null>(activeResumeId);
  const pendingResumeCreationRef = useRef<Promise<
    Awaited<ReturnType<typeof saveResume>>
  > | null>(null);
  const initialViewportHeightRef = useRef<number>(
    typeof window !== "undefined" ? window.innerHeight : 0,
  );

  /* ── Keyboard shortcuts (Ctrl+Z / Ctrl+Y / Escape) ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowTemplatePicker(false);
        setShowCoverLetter(false);
        setShowAISettings(false);
        setShowResumeManager(false);
        return;
      }
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

  /* ── Navigation guard: warn on tab close with unsaved changes ── */
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isSaving || (step === "editor" && resumeData)) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isSaving, step, resumeData]);

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

  useEffect(() => {
    if (!user?.id) {
      setSupabaseAccessTokenGetter(null);
      return;
    }

    setSupabaseAccessTokenGetter(async () => {
      try {
        if (CLERK_SUPABASE_TEMPLATE) {
          return await getToken({ template: CLERK_SUPABASE_TEMPLATE });
        }
        return await getToken();
      } catch {
        return null;
      }
    });

    return () => setSupabaseAccessTokenGetter(null);
  }, [getToken, user?.id]);

  useEffect(() => {
    if (user || step !== "landing") {
      setIsAuthStarting(false);
      if (authStartTimeoutRef.current) {
        window.clearTimeout(authStartTimeoutRef.current);
        authStartTimeoutRef.current = null;
      }
    }
  }, [user, step]);

  useEffect(() => {
    return () => {
      if (authStartTimeoutRef.current) {
        window.clearTimeout(authStartTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const handleChange = (event: MediaQueryListEvent) => {
      setIsCompactScreen(event.matches);
    };
    setIsCompactScreen(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!isCompactScreen) {
      setShowMobileResumePreview(false);
      setIsMobileKeyboardOpen(false);
      setIsTextEntryFocused(false);
      document.documentElement.style.setProperty("--vk-offset", "0px");
    }
  }, [isCompactScreen]);

  useEffect(() => {
    if (typeof window === "undefined" || !isCompactScreen) return;

    const isTextEntryElement = (
      target: EventTarget | null,
    ): target is HTMLInputElement | HTMLTextAreaElement => {
      if (!(target instanceof HTMLElement)) return false;
      if (target instanceof HTMLTextAreaElement) return true;
      if (target instanceof HTMLInputElement) {
        const blockedTypes = new Set([
          "button",
          "submit",
          "reset",
          "checkbox",
          "radio",
          "file",
        ]);
        return !blockedTypes.has(target.type);
      }
      return false;
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isTextEntryElement(event.target)) return;
      const activeTarget = event.target;
      setIsTextEntryFocused(true);
      window.setTimeout(() => {
        activeTarget.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 140);
    };

    const handleFocusOut = () => {
      window.setTimeout(() => {
        const active = document.activeElement;
        if (
          !(
            active instanceof HTMLInputElement ||
            active instanceof HTMLTextAreaElement
          )
        ) {
          setIsTextEntryFocused(false);
        }
      }, 90);
    };

    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("focusout", handleFocusOut);
    return () => {
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("focusout", handleFocusOut);
    };
  }, [isCompactScreen]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !window.visualViewport ||
      !isCompactScreen
    )
      return;
    const viewport = window.visualViewport;
    initialViewportHeightRef.current = Math.max(
      initialViewportHeightRef.current || 0,
      window.innerHeight,
      viewport.height,
    );

    const updateViewportState = () => {
      const baseline = initialViewportHeightRef.current || window.innerHeight;
      const currentHeight = viewport.height;
      const keyboardOpen = currentHeight < baseline * 0.78;
      setIsMobileKeyboardOpen(keyboardOpen);

      const offset = Math.max(
        0,
        window.innerHeight - currentHeight - viewport.offsetTop,
      );
      document.documentElement.style.setProperty(
        "--vk-offset",
        `${Math.round(offset)}px`,
      );
    };

    updateViewportState();
    viewport.addEventListener("resize", updateViewportState);
    viewport.addEventListener("scroll", updateViewportState);
    window.addEventListener("orientationchange", updateViewportState);

    return () => {
      viewport.removeEventListener("resize", updateViewportState);
      viewport.removeEventListener("scroll", updateViewportState);
      window.removeEventListener("orientationchange", updateViewportState);
      document.documentElement.style.setProperty("--vk-offset", "0px");
    };
  }, [isCompactScreen]);

  useEffect(() => {
    if (!isDbLoading) {
      setDbLoadPercent(18);
      return;
    }
    const interval = window.setInterval(() => {
      setDbLoadPercent((previous) => Math.min(previous + 7, 92));
    }, 400);
    return () => window.clearInterval(interval);
  }, [isDbLoading]);

  useEffect(() => {
    if (!isPdfLoading) {
      setPdfLoadPercent(12);
      return;
    }
    const interval = window.setInterval(() => {
      setPdfLoadPercent((previous) => Math.min(previous + 6, 88));
    }, 450);
    return () => window.clearInterval(interval);
  }, [isPdfLoading]);

  useEffect(() => {
    if (step !== "score" && step !== "editor") {
      setShowMobileResumePreview(false);
    }
  }, [step]);

  const analyzingPercent = useMemo(
    () => getAnalyzeProgressPercent(loadingMessage),
    [loadingMessage],
  );
  const optimizePercent = useMemo(
    () => getOptimizeProgressPercent(optimizeProgress),
    [optimizeProgress],
  );
  const useStickyMobileActions =
    isCompactScreen && !isMobileKeyboardOpen && !isTextEntryFocused;

  useEffect(() => {
    activeResumeIdRef.current = activeResumeId;
  }, [activeResumeId]);

  /* ── Auto-load from Supabase when user signs in ──── */
  useEffect(() => {
    if (!user?.id) return;
    identifyAnalyticsUser(user.id, { signed_in: true });
    setIsDbLoading(true);
    loadLatestResume(user.id)
      .then((savedRow) => {
        if (pendingMode === "create") {
          setActiveResumeId(null);
          setActiveResumeName(null);
          setResumeData(createEmptyResume(), false);
          setMode("create");
          setPendingMode(null);
          setStep("editor");
          return;
        }

        if (savedRow) {
          trackEvent("resume_loaded", { source: "supabase" });
          setResumeData(savedRow.data, false);
          setActiveResumeId(savedRow.id);
          setActiveResumeName(savedRow.name || "Untitled Resume");
          // If user had a pending mode from landing page, honor it
          if (pendingMode) {
            setMode(pendingMode);
            setPendingMode(null);
            if (pendingMode === "ats") {
              setStep("input");
            } else {
              setStep("editor");
            }
          } else {
            // Returning user with saved resume → straight to editor
            setMode("edit");
            setStep("editor");
          }
        } else if (pendingMode) {
          // No saved resume, but user picked a mode
          setMode(pendingMode);
          setPendingMode(null);
          setStep("input");
        } else {
          // No saved resume and no pending mode — show landing
          setActiveResumeId(null);
          setActiveResumeName(null);
          setResumeData(null, false);
          setStep("landing");
        }
      })
      .catch((err) => {
        console.error("Supabase load failed:", err);
        trackEvent("resume_load_failed", { source: "supabase" });
        setError(
          "Failed to load saved resume from database. Check console for details.",
        );
        // Still honor pending mode on error
        if (pendingMode) {
          setMode(pendingMode);
          setPendingMode(null);
          if (pendingMode === "create") {
            setActiveResumeId(null);
            setActiveResumeName(null);
            setResumeData(createEmptyResume(), false);
            setStep("editor");
          } else {
            setStep("input");
          }
        }
      })
      .finally(() => setIsDbLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const path = `/${mode || "landing"}/${step}`;
    trackPageView(path, `Resume Maker - ${step}`);
    trackEvent("app_step_viewed", {
      mode: mode || "none",
      step,
    });
  }, [mode, step]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const source = params.get("utm_source");
    const campaign = params.get("utm_campaign");
    if (!source || !campaign) return;

    const dedupeKey = `${source}:${campaign}:${params.get("utm_content") || ""}`;
    const storageKey = "last_landing_campaign";
    if (window.sessionStorage.getItem(storageKey) === dedupeKey) return;

    trackEvent("landing_campaign_attribution", {
      utm_source: source,
      utm_medium: params.get("utm_medium") || "",
      utm_campaign: campaign,
      utm_content: params.get("utm_content") || "",
      entry_path: window.location.pathname,
    });

    window.sessionStorage.setItem(storageKey, dedupeKey);
  }, []);

  /* ── Debounced auto-save to Supabase (500ms) ────── */
  const debouncedSupabaseSave = useDebounce(async (data: ResumeData) => {
    if (!user?.id) return;
    setIsSaving(true);
    setSaveStatus("saving");

    try {
      const currentResumeId = activeResumeIdRef.current;
      let savedRow;

      if (currentResumeId) {
        savedRow = await saveResume(user.id, data, {
          resumeId: currentResumeId,
          name: activeResumeName ?? undefined,
        });
      } else {
        if (!pendingResumeCreationRef.current) {
          pendingResumeCreationRef.current = saveResume(user.id, data, {
            name: activeResumeName ?? undefined,
          });
        }

        savedRow = await pendingResumeCreationRef.current;
        pendingResumeCreationRef.current = null;
      }

      if (!savedRow) {
        throw new Error("Resume save returned no row.");
      }

      activeResumeIdRef.current = savedRow.id;
      setActiveResumeId(savedRow.id);
      setActiveResumeName(savedRow.name || "Untitled Resume");
      trackEvent("resume_saved", {
        destination: "supabase",
        success: true,
        resume_id: savedRow.id,
        created_new_resume: !currentResumeId,
      });
      setSaveStatus("saved");
    } catch (err) {
      pendingResumeCreationRef.current = null;
      console.error("Supabase save failed:", err);
      trackEvent("resume_save_failed", { destination: "supabase" });
      setSaveStatus("idle");
    } finally {
      setIsSaving(false);
    }
  }, 500);

  const handleResumeChange = useCallback(
    (data: ResumeData) => {
      setResumeData(data);
      setSaveStatus("idle"); // Mark as unsaved immediately
      debouncedSupabaseSave(data);
      if (privacySettings.saveLocalBackups) {
        saveLocalBackup(data, jdText);
        setHasBackup(true);
      }
    },
    [
      setResumeData,
      debouncedSupabaseSave,
      jdText,
      privacySettings.saveLocalBackups,
      setHasBackup,
    ],
  );

  const handleExportPDF = useCallback(async () => {
    const el = resumeRef.current;
    if (!el) return;
    if (resumeData) {
      const validation = validateForExport(resumeData);
      if (!validation.valid) {
        setError(validation.errors.join("\n"));
        return;
      }
    }
    const fileName = resumeData
      ? `${resumeData.contact.name.replace(/\s+/g, "_")}_Resume`
      : "Resume";
    try {
      await exportResumeToPDF(el, fileName, resumeData ?? undefined, {
        embedResumeData: privacySettings.embedResumeDataInPdf,
      });
      trackEvent("resume_exported", {
        format: "pdf",
        has_resume_data: Boolean(resumeData),
        embedded_resume_data: privacySettings.embedResumeDataInPdf,
      });
    } catch (err) {
      console.error("PDF export failed:", err);
      trackEvent("resume_export_failed", { format: "pdf" });
      setError("PDF export failed. Please try again.");
    }
  }, [privacySettings.embedResumeDataInPdf, resumeData, setError]);

  /* ── Mode Selection (landing page) ───────────────── */

  const handleSelectMode = useCallback(
    (selectedMode: AppMode) => {
      trackEvent("mode_selected", {
        mode: selectedMode,
        signed_in: Boolean(user),
      });
      if (!user) {
        // Not signed in → save mode and let Clerk prompt
        setPendingMode(selectedMode);
        return;
      }
      setMode(selectedMode);
      setError(null);
      if (selectedMode === "create") {
        setActiveResumeId(null);
        setActiveResumeName(null);
        setResumeData(createEmptyResume(), false);
        setStep("editor");
      } else if (selectedMode === "ats") {
        if (resumeData) {
          // Already have resume data, go to input for JD
          setStep("input");
        } else {
          setStep("input");
        }
      } else {
        // edit mode
        if (resumeData) {
          setStep("editor");
        } else {
          setStep("input");
        }
      }
    },
    [
      user,
      setMode,
      setStep,
      setError,
      resumeData,
      setResumeData,
      setActiveResumeId,
      setActiveResumeName,
    ],
  );

  const startSignInFlow = useCallback(
    (selectedMode: AppMode) => {
      if (isAuthStarting) return;
      setPendingMode(selectedMode);
      setIsAuthStarting(true);
      trackEvent("sign_in_initiated", { mode: selectedMode });
      if (authStartTimeoutRef.current) {
        window.clearTimeout(authStartTimeoutRef.current);
      }
      authStartTimeoutRef.current = window.setTimeout(() => {
        setIsAuthStarting(false);
        authStartTimeoutRef.current = null;
      }, 10000);
    },
    [isAuthStarting],
  );

  /* ── PDF Upload ──────────────────────────────────────── */

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isPdfLoading) {
      trackEvent("pdf_upload_blocked", { reason: "already_processing" });
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    trackEvent("pdf_upload_started", {
      file_name: file.name,
      file_size_kb: Math.round(file.size / 1024),
    });

    const validation = validatePDFFile(file);
    if (!validation.valid) {
      trackEvent("pdf_upload_failed", { reason: "validation_failed" });
      setError(validation.error || "Invalid file.");
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      return;
    }

    setUploadedFileName(file.name);
    setIsPdfLoading(true);
    setError(null);
    setLoadingMessage("Reading PDF file...");
    setPdfLoadPercent(15);
    try {
      // First, check for embedded ResumeData (from our own exported PDFs)
      const embedded = await extractEmbeddedResumeData(file);
      if (embedded) {
        trackEvent("pdf_upload_completed", { source: "embedded_metadata" });
        setUploadedFileName(file.name);
        const pdfBlobUrl = URL.createObjectURL(file);
        setOriginalPdfUrl(pdfBlobUrl);
        handleResumeChange(embedded);

        if (mode === "ats") {
          setStep("input");
        } else {
          setStep("editor");
        }
        return;
      }

      // Fallback: extract text from non-app PDFs
      const extracted = await extractTextAndLinks(file);
      let text = extracted.text;
      const links = extracted.links;

      // OCR fallback for image-based PDFs (e.g., old exports without metadata)
      if (!text.trim()) {
        trackEvent("pdf_ocr_started", { file_name: file.name });
        setPdfLoadPercent(30);
        setLoadingMessage(
          "Image-based PDF detected — running OCR to extract text...",
        );
        setStep("analyzing");
        const ocr = await extractTextWithOCR(file, (page, total) => {
          setLoadingMessage(`Running OCR on page ${page} of ${total}...`);
          if (total > 0) {
            setPdfLoadPercent(clampPercent(30 + (page / total) * 45));
          }
        });
        text = ocr.text;
        trackEvent("pdf_ocr_completed", {
          extracted_characters: text.length,
        });
        // Keep annotation links from extractTextAndLinks — image PDFs can still
        // have clickable link annotations (e.g., our exported PDFs do).
      }

      if (!text.trim()) {
        throw new Error(
          "Could not extract text from this PDF even with OCR. Try pasting the text manually.",
        );
      }

      const sanitized = sanitizeText(text);
      setResumeText(sanitized);
      setUploadedFileName(file.name);
      extractedLinksRef.current = links;

      // Store original PDF as blob URL for side-by-side preview
      const pdfBlobUrl = URL.createObjectURL(file);
      setOriginalPdfUrl(pdfBlobUrl);

      // Run template style detection in background (non-blocking)
      detectTemplateStyle(aiSettings, sanitized)
        .then((detected) => {
          setDetectedStyle(detected);
          if (detected.confidence >= 50) {
            const { templateId, customization } = detected;
            const store = useAppStore.getState();
            store.setTemplateId(templateId);
            store.setCustomization(customization);
          }
        })
        .catch((err) => {
          console.warn("Template detection failed (non-critical):", err);
        });

      // Auto-parse the resume immediately
      setPdfLoadPercent(88);
      setLoadingMessage(
        "Parsing your resume with AI (preserving all links)...",
      );
      setStep("analyzing");
      recordAction("analyze");

      const parsed = await parseResumeFromText(aiSettings, sanitized, links);
      trackEvent("resume_parsed", {
        source: "pdf_upload",
        links_found: links.length,
      });
      handleResumeChange(parsed);

      if (mode === "ats") {
        // In ATS mode, go to input for JD entry
        setStep("input");
      } else {
        // In edit mode, go straight to editor
        setStep("editor");
      }
    } catch (err) {
      trackEvent("pdf_upload_failed", {
        reason: err instanceof Error ? err.message : "unknown",
      });
      setError(err instanceof Error ? err.message : "Failed to read PDF");
      setStep("input");
    } finally {
      setIsPdfLoading(false);
      setPdfLoadPercent(100);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  };

  const handleClearUpload = useCallback(() => {
    setResumeText("");
    setUploadedFileName(null);
    setDetectedStyle(null);
    setOriginalPdfUrl(null);
    extractedLinksRef.current = [];
  }, [setResumeText, setUploadedFileName, setDetectedStyle, setOriginalPdfUrl]);

  /* ── Parse Resume (edit mode — no JD) ────────────────── */

  const handleParseResume = async () => {
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

    const controller = getRequestController("parse-resume");

    try {
      if (controller.signal.aborted) return;
      const parsed = await parseResumeFromText(
        aiSettings,
        sanitizeText(resumeText),
        extractedLinksRef.current.length > 0
          ? extractedLinksRef.current
          : undefined,
      );
      if (controller.signal.aborted) return;
      trackEvent("resume_parsed", { source: "pasted_text" });
      handleResumeChange(parsed);
      setStep("editor");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Parsing failed");
      setStep("input");
    } finally {
      clearRequestController("parse-resume");
    }
  };

  /* ── Analyze (ATS mode — resume + JD) ───────────────── */

  const handleAnalyze = async () => {
    if (!resumeText.trim() && !resumeData) return;
    if (!jdText.trim()) return;

    if (!resumeData) {
      const resumeValidation = validateResumeText(resumeText);
      if (!resumeValidation.valid) {
        setError(resumeValidation.error || "Invalid resume text.");
        return;
      }
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
    recordAction("analyze");

    const controller = getRequestController("analyze");

    try {
      let parsed = resumeData;
      if (!parsed) {
        setLoadingMessage("Parsing your resume with AI...");
        if (controller.signal.aborted) return;
        parsed = await parseResumeFromText(
          aiSettings,
          sanitizeText(resumeText),
          extractedLinksRef.current.length > 0
            ? extractedLinksRef.current
            : undefined,
        );
        if (controller.signal.aborted) return;
        handleResumeChange(parsed);
      }

      setLoadingMessage("Running ATS analysis...");
      const ats = await analyzeATSScore(
        aiSettings,
        parsed,
        sanitizeText(jdText),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      trackEvent("ats_analysis_completed", {
        mode: "ats",
        overall_score: ats.overallScore,
      });
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

  /* ── Analyze Existing (from editor, with new JD) ───── */

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
        controller.signal,
      );
      if (controller.signal.aborted) return;
      trackEvent("ats_analysis_completed", {
        mode: "editor_reanalyze",
        overall_score: ats.overallScore,
      });
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

    const controller = getRequestController("self-score");

    try {
      const ats = await selfATSScore(aiSettings, resumeData, controller.signal);
      if (controller.signal.aborted) return;
      trackEvent("ats_self_score_completed", {
        overall_score: ats.overallScore,
      });
      setATSResult(ats);
      setOptimizeDone(false);
      setPreviousScore(null);
      setStep("score");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Self scoring failed");
      setStep("editor");
    } finally {
      clearRequestController("self-score");
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
        2,
        (p) => setOptimizeProgress({ ...p }),
        controller.signal,
      );

      if (controller.signal.aborted) return;
      if (result.finalResume) {
        handleResumeChange(result.finalResume);
        const finalATS = result.finalATSResult;
        if (finalATS) {
          setATSResult(finalATS);
        }
        trackEvent("resume_optimized", {
          mode: "self_optimize",
          overall_score: finalATS?.overallScore ?? result.finalScore,
        });
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

  /* ── Optimize (with JD) ────────────────────────────── */

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
        2,
        (p) => setOptimizeProgress({ ...p }),
        controller.signal,
      );

      if (controller.signal.aborted) return;
      if (result.finalResume) {
        handleResumeChange(result.finalResume);
        const finalATS = result.finalATSResult;
        if (finalATS) {
          setATSResult(finalATS);
        }
        trackEvent("resume_optimized", {
          mode: "jd_optimize",
          overall_score: finalATS?.overallScore ?? result.finalScore,
        });
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
  const handleStartOver = useCallback(() => {
    if (
      resumeData &&
      !window.confirm(
        "You have resume data that may not be fully saved. Are you sure you want to start over?",
      )
    ) {
      return;
    }
    // Abort all in-flight AI requests before resetting
    abortRef.current?.abort();
    for (const key of [
      "pdf-upload",
      "parse-resume",
      "analyze",
      "analyze-existing",
      "optimize",
      "self-optimize",
      "self-score",
      "cover-letter",
    ]) {
      abortRequestController(key);
    }
    pendingResumeCreationRef.current = null;
    startOver();
  }, [startOver, resumeData]);

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
    trackEvent("resume_exported", { format: "json" });
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
            setActiveResumeId(null);
            setActiveResumeName(null);
            handleResumeChange(raw as ResumeData);
            setStep("editor");
            trackEvent("resume_imported", { format: "json" });
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
    const validation = validateForExport(resumeData);
    if (!validation.valid) {
      setError(validation.errors.join("\n"));
      return;
    }
    try {
      await exportToDocx(resumeData);
      trackEvent("resume_exported", { format: "docx" });
    } catch (err) {
      trackEvent("resume_export_failed", { format: "docx" });
      setError(err instanceof Error ? err.message : "DOCX export failed");
    }
  };

  /* ── Step indicator config per mode ─────────────────── */

  const getStepConfig = () => {
    if (mode === "ats") {
      return [
        { key: "input", label: "Resume & JD" },
        { key: "score", label: "ATS Score" },
        { key: "editor", label: "Editor" },
      ];
    }
    if (mode === "edit") {
      return [
        { key: "input", label: "Resume Input" },
        { key: "editor", label: "Editor" },
      ];
    }
    if (mode === "create") {
      return [{ key: "editor", label: "Editor" }];
    }
    return [];
  };

  const getStepStatus = (stepKey: string) => {
    const steps = getStepConfig().map((s) => s.key);
    const currentIdx = steps.indexOf(step);
    const thisIdx = steps.indexOf(stepKey);
    if (thisIdx < currentIdx) return "completed";
    if (thisIdx === currentIdx) return "active";
    return "";
  };

  const getModeTitle = (selectedMode: AppMode): string => {
    if (selectedMode === "ats") return "ATS Score & Optimize";
    if (selectedMode === "edit") return "Edit My Resume";
    if (selectedMode === "create") return "Create New Resume";
    return "Choose an option";
  };

  /* ─── Render ─────────────────────────────────────────── */

  return (
    <div
      className={`app${isMobileKeyboardOpen ? " keyboard-open" : ""}${isTextEntryFocused ? " text-entry-focused" : ""}`}
    >
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
          {saveStatus === "saving" && (
            <span className="save-indicator">Saving...</span>
          )}
          {saveStatus === "saved" && (
            <span className="save-indicator saved">Saved ✓</span>
          )}
          {saveStatus === "idle" && step === "editor" && resumeData && user && (
            <span className="save-indicator unsaved">Unsaved changes •</span>
          )}

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

          <button
            className="header-btn header-btn-labeled"
            onClick={() => setShowTemplatePicker(true)}
            title="Templates & Style"
            aria-label="Templates & Style"
          >
            <Palette size={14} />
            <span>Templates & Style</span>
          </button>

          <button
            className="header-btn"
            onClick={() => setShowAISettings(true)}
            title="Settings"
            aria-label="Settings"
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

          {step !== "landing" && step !== "analyzing" && (
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
                onClick={handleExportPDF}
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
        {saveStatus === "saving" && "Saving resume..."}
        {saveStatus === "saved" && "Resume saved"}
        {error && `Error: ${error}`}
        {step === "analyzing" && loadingMessage}
      </div>

      {/* Step Indicator — only for active flows (not landing) */}
      {mode && step !== "analyzing" && step !== "landing" && (
        <nav className="step-indicator" aria-label="Progress">
          {getStepConfig().map((s, i) => (
            <span key={s.key} style={{ display: "contents" }}>
              {i > 0 && <ChevronRight size={16} className="step-arrow" />}
              <div className={`step-item ${getStepStatus(s.key)}`}>
                <div className="step-number">{i + 1}</div>
                <span>{s.label}</span>
              </div>
            </span>
          ))}
        </nav>
      )}

      {/* Main Content */}
      <main className="app-main" id="main-content" role="main">
        {/* ═══ LANDING PAGE ═══ */}
        {step === "landing" && !isDbLoading && (
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
                    ? `Selected: ${getModeTitle(pendingMode)}`
                    : "Choose one option above, then sign in to continue."}
                </p>
                <SignInButton mode="modal">
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
                        ? "Sign In & Continue"
                        : "Select an Option First"}
                  </button>
                </SignInButton>
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
        )}

        {/* DB Loading */}
        {isDbLoading && (
          <div className="analyzing-step">
            <h2>Loading your saved resume...</h2>
            <div className="loading-progress-number">{dbLoadPercent}%</div>
            <div className="loading-progress-track" aria-hidden="true">
              <div
                className="loading-progress-fill"
                style={{ width: `${dbLoadPercent}%` }}
              />
            </div>
            <p>Syncing your latest resume data</p>
          </div>
        )}

        {/* ═══ INPUT STEP — ATS MODE ═══ */}
        {step === "input" && mode === "ats" && !isDbLoading && (
          <div
            className="input-step"
            role="region"
            aria-label="Resume and JD input"
          >
            <div className="input-hero">
              <h2>ATS Score & Optimize</h2>
              <p>
                {resumeData
                  ? "Your resume is loaded. Paste the job description below to run ATS analysis."
                  : "Paste your resume and the target job description to get an ATS score."}
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
              {resumeData ? (
                <button
                  className="analyze-btn"
                  onClick={handleAnalyzeExisting}
                  disabled={!jdText.trim() || isRateLimited("analyze", 30000)}
                >
                  {isRateLimited("analyze", 30000) ? (
                    <>
                      <Clock size={18} />
                      Wait{" "}
                      {formatCooldown(getRateLimitRemaining("analyze", 30000))}
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
                    !resumeText.trim() ||
                    !jdText.trim() ||
                    isRateLimited("analyze", 30000)
                  }
                >
                  {isRateLimited("analyze", 30000) ? (
                    <>
                      <Clock size={18} />
                      Wait{" "}
                      {formatCooldown(getRateLimitRemaining("analyze", 30000))}
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
            </div>
          </div>
        )}

        {/* ═══ INPUT STEP — EDIT MODE ═══ */}
        {step === "input" && mode === "edit" && !isDbLoading && (
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
              <button
                className="analyze-btn"
                onClick={handleParseResume}
                disabled={!resumeText.trim() || isRateLimited("analyze", 30000)}
              >
                {isRateLimited("analyze", 30000) ? (
                  <>
                    <Clock size={18} />
                    Wait{" "}
                    {formatCooldown(getRateLimitRemaining("analyze", 30000))}
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

        {/* ═══ ANALYZING STEP ═══ */}
        {step === "analyzing" && (
          <div className="analyzing-step" role="status" aria-live="polite">
            <h2>{loadingMessage}</h2>
            <div className="loading-progress-number">{analyzingPercent}%</div>
            <div className="loading-progress-track" aria-hidden="true">
              <div
                className="loading-progress-fill"
                style={{ width: `${analyzingPercent}%` }}
              />
            </div>
            <p>Processing step by step...</p>
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
                  <h3>{jdText.trim() ? "ATS Score" : "Self ATS Score"}</h3>
                  {!jdText.trim() && (
                    <small className="self-score-tag">
                      General best practices — no JD
                    </small>
                  )}
                  <p>{atsResult.summaryVerdict}</p>
                  {optimizeDone && previousScore !== null && (
                    <div className="improvement-badge">
                      <Trophy size={16} />
                      Improved: {previousScore} &rarr; {atsResult.overallScore}
                    </div>
                  )}
                </div>
              </div>

              <div className="keywords-section">
                <h4>
                  {jdText.trim() ? "Keywords Found" : "Industry Keywords Found"}
                </h4>
                <div className="keyword-tags">
                  {uniqueStrings([
                    ...(atsResult.breakdown.keywordMatch.matchedKeywords || []),
                    ...(atsResult.breakdown.skillsAlignment.matchedSkills || []),
                  ]).map((k) => (
                    <span key={k} className="tag tag-match">
                      {k}
                    </span>
                  ))}
                </div>
                <h4>
                  {jdText.trim()
                    ? "Missing Keywords"
                    : "Suggested Keywords to Add"}
                </h4>
                <div className="keyword-tags">
                  {uniqueStrings([
                    ...(atsResult.breakdown.keywordMatch.missingKeywords || []),
                    ...(atsResult.breakdown.skillsAlignment.missingSkills || []),
                  ]).map((k) => (
                    <span key={k} className="tag tag-missing">
                      {k}
                    </span>
                  ))}
                </div>
              </div>

              <div className="breakdown-section">
                <h4>Breakdown</h4>
                <BreakdownBar
                  label={jdText.trim() ? "Keyword Match" : "Industry Keywords"}
                  score={atsResult.breakdown.keywordMatch.score}
                  weight={atsResult.breakdown.keywordMatch.weight}
                />
                <BreakdownBar
                  label={
                    jdText.trim() ? "Skills Alignment" : "Skills Presentation"
                  }
                  score={atsResult.breakdown.skillsAlignment.score}
                  weight={atsResult.breakdown.skillsAlignment.weight}
                />
                <BreakdownBar
                  label={
                    jdText.trim() ? "Experience Relevance" : "Content Quality"
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

              {atsResult.qualityInsights?.signals?.length ? (
                <div className="feedback-section">
                  <h4>Resume Signals</h4>
                  <div className="feedback-grid">
                    {atsResult.qualityInsights.signals.map((signal) => (
                      <FeedbackSignalCard key={signal.id} signal={signal} />
                    ))}
                  </div>
                </div>
              ) : null}

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
                    <span>{optimizeProgress.message}</span>
                    <strong>{optimizePercent}%</strong>
                  </div>
                  <div className="loading-progress-track" aria-hidden="true">
                    <div
                      className="loading-progress-fill"
                      style={{ width: `${optimizePercent}%` }}
                    />
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
                <div
                  className={`score-actions ${useStickyMobileActions ? "score-actions-sticky" : ""}`}
                >
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

              {isCompactScreen && (
                <div className="mobile-resume-trigger-row">
                  <button
                    className="btn-secondary mobile-resume-trigger"
                    onClick={() => setShowMobileResumePreview(true)}
                  >
                    <Eye size={16} /> Show Resume
                  </button>
                </div>
              )}
            </div>

            {!isCompactScreen && (
              <div className="score-right">
                <div className="preview-container">
                  <ErrorBoundary>
                    <Suspense fallback={<PreviewSkeleton />}>
                      <ResumeTemplate ref={resumeRef} data={resumeData} />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ EDITOR STEP ═══ */}
        {step === "editor" && resumeData && (
          <div className="editor-step" role="region" aria-label="Resume editor">
            <div className="editor-left">
              {isCompactScreen && (
                <div className="mobile-resume-trigger-row mobile-resume-trigger-row-top">
                  <button
                    className="btn-secondary mobile-resume-trigger"
                    onClick={() => setShowMobileResumePreview(true)}
                  >
                    <Eye size={16} /> Show Resume
                  </button>
                </div>
              )}
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
            {!isCompactScreen && (
              <div className="editor-right">
                <div className="preview-container">
                  <ErrorBoundary>
                    <Suspense fallback={<PreviewSkeleton />}>
                      <ResumeTemplate ref={resumeRef} data={resumeData} />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              </div>
            )}
          </div>
        )}

        {resumeData &&
          isCompactScreen &&
          showMobileResumePreview &&
          (step === "editor" || (step === "score" && atsResult)) && (
            <div
              className="mobile-resume-overlay"
              onClick={() => setShowMobileResumePreview(false)}
              role="dialog"
              aria-modal="true"
              aria-label="Resume preview"
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
                    aria-label="Close resume preview"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="mobile-resume-sheet-body">
                  <div className="preview-container">
                    <ErrorBoundary>
                      <Suspense fallback={<PreviewSkeleton />}>
                        <ResumeTemplate ref={resumeRef} data={resumeData} />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                </div>
              </div>
            </div>
          )}
      </main>

      {/* Modals/Panels */}
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
