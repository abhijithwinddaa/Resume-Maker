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
import { useTranslation } from "react-i18next";
import { useReactToPrint } from "react-to-print";
import { validateForExport, autoFixTypos } from "./utils/exportValidation";
import {
  useAuth,
  useUser,
  SignedIn,
  SignedOut,
  useClerk,
  UserButton,
} from "@clerk/clerk-react";
import { useAppStore } from "./store/appStore";
import type { AppMode } from "./store/appStore";
import type { ResumeData } from "./types/resume";
import { createEmptyResume } from "./types/resume";
import type { TemplateCustomization } from "./types/templates";
import {
  parseResumeFromText,
  analyzeATSScore,
  optimizeResumeLoop,
  selfATSScore,
  selfOptimizeLoop,
  setServerAuthTokenGetter,
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
  resetCooldown,
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
import { recordFeatureUsage } from "./services/popularityService";
import { isAdminEmail } from "./utils/adminAccess";
import { checkUserHasSubmittedFeedback } from "./services/feedbackService";
import {
  evaluateFeedbackExportGate,
  FEEDBACK_GATE_STATUS_ERROR_MESSAGE,
} from "./utils/feedbackExportGate";
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
  MessageSquare,
  Palette,
  FileType,
  Mail,
  FolderOpen,
  Eye,
  Shield,
  PlusCircle,
  CheckCircle2,
  AlertTriangle,
  Settings,
} from "lucide-react";
import "./App.css";

/* ─── Lazy-loaded heavy components ─────────────────── */
const ResumeTemplate = lazy(() => import("./components/ResumeTemplate"));
const ResumeEditor = lazy(() => import("./components/ResumeEditor"));
const TemplatePicker = lazy(() => import("./components/TemplatePicker"));
const CoverLetterPanel = lazy(() => import("./components/CoverLetter"));
const ResumeManagerPanel = lazy(() => import("./components/ResumeManager"));
const PdfPreviewPanel = lazy(() => import("./components/PdfPreview"));
const FeedbackPanel = lazy(() => import("./components/FeedbackPanel"));
const CLERK_SUPABASE_TEMPLATE =
  import.meta.env.VITE_CLERK_SUPABASE_TEMPLATE || "supabase";
const FEEDBACK_PROMPT_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 14;
const FEEDBACK_PROMPT_LAST_AT_KEY = "feedback-prompt-last-at";

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

type ExperienceTier = "fresher" | "experienced";
type CompressionStage = "none" | "tight-spacing" | "compact" | "small-compact";

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function parseDateToken(rawToken: string): Date | null {
  const token = rawToken.trim().toLowerCase();
  if (!token) return null;
  if (/present|current|now/.test(token)) {
    return new Date();
  }

  const monthMatch = token.match(
    /(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)/,
  );
  const yearMatch = token.match(/(19|20)\d{2}/);

  if (yearMatch) {
    const year = Number(yearMatch[0]);
    const month = monthMatch ? (MONTH_INDEX[monthMatch[0]] ?? 0) : 6;
    return new Date(year, month, 1);
  }

  const parsed = new Date(rawToken);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

function estimateExperienceMonths(resumeData: ResumeData | null): number {
  if (!resumeData) return 0;

  let totalMonths = 0;
  const meaningfulEntries = resumeData.experience.filter(
    (entry) =>
      entry.company.trim() ||
      entry.role.trim() ||
      entry.dateRange.trim() ||
      entry.bullets.some((bullet) => bullet.trim()),
  );

  for (const entry of meaningfulEntries) {
    const dateRange = entry.dateRange.trim();
    if (!dateRange) continue;

    const [startRaw, endRaw] = dateRange
      .split(/\s*(?:-|–|to)\s*/i)
      .filter(Boolean);
    const start = parseDateToken(startRaw || "");
    const end = parseDateToken(endRaw || "present");

    if (!start || !end) continue;

    const startIndex = start.getFullYear() * 12 + start.getMonth();
    const endIndex = end.getFullYear() * 12 + end.getMonth();
    if (endIndex >= startIndex) {
      totalMonths += endIndex - startIndex + 1;
    }
  }

  if (totalMonths > 0) return totalMonths;

  // Conservative fallback when date parsing fails but experience exists.
  return meaningfulEntries.length >= 2
    ? 24
    : meaningfulEntries.length === 1
      ? 12
      : 0;
}

function getExperienceTier(resumeData: ResumeData | null): ExperienceTier {
  const months = estimateExperienceMonths(resumeData);
  return months < 18 ? "fresher" : "experienced";
}

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

/* ─── Main App ─────────────────────────────────────────── */

function App() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const { openSignIn } = useClerk();
  const { t } = useTranslation();
  const userEmail =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress ||
    "";
  const isAdminUser = isAdminEmail(userEmail);

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
  const cooldownRemaining = useAppStore((s) => s.cooldownRemaining);
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
  const exportPageMode = useAppStore((s) => s.exportPageMode);
  const setExportPageMode = useAppStore((s) => s.setExportPageMode);

  // Panel visibility
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showCoverLetter, setShowCoverLetter] = useState(false);
  const [showResumeManager, setShowResumeManager] = useState(false);
  const [showFeedbackPanel, setShowFeedbackPanel] = useState(false);
  const [feedbackInitialTab, setFeedbackInitialTab] = useState<
    "my" | "community" | "admin"
  >("community");
  const [pendingExportFormat, setPendingExportFormat] = useState<
    "pdf" | "docx" | null
  >(null);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [settingsMenuPosition, setSettingsMenuPosition] = useState({
    top: 0,
    left: 0,
  });

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
  const [modeToastMessage, setModeToastMessage] = useState<string | null>(null);
  const [atsResumeSource, setAtsResumeSource] = useState<"existing" | "new">(
    "existing",
  );
  const [isExporting, setIsExporting] = useState(false);
  const [exportToastMessage, setExportToastMessage] = useState<string | null>(
    null,
  );
  const [exportCustomizationOverride, setExportCustomizationOverride] =
    useState<Partial<TemplateCustomization> | null>(null);
  const [lastExportPageEstimate, setLastExportPageEstimate] = useState<
    number | null
  >(null);
  const [preferredExportFormat, setPreferredExportFormat] = useState<
    "pdf" | "docx"
  >(() => {
    try {
      const saved = localStorage.getItem("preferred-export-format");
      return saved === "docx" ? "docx" : "pdf";
    } catch {
      return "pdf";
    }
  });

  // Deferred auth: track which mode was selected before sign-in
  const [pendingMode, setPendingMode] = useState<AppMode>(null);

  // Extracted PDF links for parser
  const extractedLinksRef = useRef<string[]>([]);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const resumeRef = useRef<HTMLDivElement>(null);
  const settingsMenuButtonRef = useRef<HTMLButtonElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);

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
  const abortRef = useRef<AbortController | null>(null);
  const authStartTimeoutRef = useRef<number | null>(null);
  const activeResumeIdRef = useRef<string | null>(activeResumeId);
  const modeSelectionInProgressRef = useRef(false);
  const trackedUsageRef = useRef<Set<string>>(new Set());
  const trackedAtsUsageRef = useRef(false);
  const pendingResumeCreationRef = useRef<Promise<
    Awaited<ReturnType<typeof saveResume>>
  > | null>(null);
  const feedbackGateCheckInFlightRef = useRef(false);
  const initialViewportHeightRef = useRef<number>(
    typeof window !== "undefined" ? window.innerHeight : 0,
  );

  /* ── Keyboard shortcuts (Ctrl+Z / Ctrl+Y / Escape) ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsSettingsMenuOpen(false);
        setShowTemplatePicker(false);
        setShowCoverLetter(false);
        setShowResumeManager(false);
        if (pendingExportFormat) {
          trackEvent("feedback_export_gate_cancelled", {
            format: pendingExportFormat,
          });
          setPendingExportFormat(null);
        }
        setShowFeedbackPanel(false);
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
  }, [pendingExportFormat, redo, undo]);

  useEffect(() => {
    if (!isSettingsMenuOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (
        settingsMenuRef.current?.contains(target) ||
        settingsMenuButtonRef.current?.contains(target)
      ) {
        return;
      }

      setIsSettingsMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isSettingsMenuOpen]);

  useEffect(() => {
    if (!isSettingsMenuOpen) return;

    const updateMenuPosition = () => {
      const button = settingsMenuButtonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const menuWidth = settingsMenuRef.current?.offsetWidth ?? 190;
      const menuHeight = settingsMenuRef.current?.offsetHeight ?? 280;
      const viewportPadding = 8;
      const gap = 6;

      const left = Math.min(
        window.innerWidth - menuWidth - viewportPadding,
        Math.max(viewportPadding, rect.right - menuWidth),
      );

      const preferredTop = rect.bottom + gap;
      const top =
        preferredTop + menuHeight <= window.innerHeight - viewportPadding
          ? preferredTop
          : Math.max(viewportPadding, rect.top - menuHeight - gap);

      setSettingsMenuPosition({ top, left });
    };

    updateMenuPosition();
    const rafId = window.requestAnimationFrame(updateMenuPosition);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isSettingsMenuOpen]);

  useEffect(() => {
    if (step !== "editor" && step !== "score") {
      setIsSettingsMenuOpen(false);
    }
  }, [step]);

  /* ── Navigation guard: warn on tab close with unsaved changes ── */
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isSaving || isOptimizing || (step === "editor" && resumeData)) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isSaving, isOptimizing, step, resumeData]);

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
      setServerAuthTokenGetter(null);
      trackedUsageRef.current.clear();
      trackedAtsUsageRef.current = false;
      return;
    }

    const getAuthToken = async () => {
      try {
        const templatedToken = await getToken({
          template: CLERK_SUPABASE_TEMPLATE,
        });
        if (templatedToken) {
          return templatedToken;
        }
      } catch {
        // fallback below
      }

      try {
        return await getToken();
      } catch {
        return null;
      }
    };

    setSupabaseAccessTokenGetter(getAuthToken);
    setServerAuthTokenGetter(getAuthToken);

    return () => {
      setSupabaseAccessTokenGetter(null);
      setServerAuthTokenGetter(null);
    };
  }, [getToken, user?.id]);

  useEffect(() => {
    if (!user?.id || step !== "editor") return;

    const featureKey =
      mode === "edit"
        ? "resume_edit"
        : mode === "create"
          ? "create_resume"
          : null;

    if (!featureKey) return;

    const trackingKey = `${user.id}:${featureKey}`;
    if (trackedUsageRef.current.has(trackingKey)) return;
    trackedUsageRef.current.add(trackingKey);

    void recordFeatureUsage(featureKey);
  }, [mode, step, user?.id]);

  useEffect(() => {
    if (!user?.id || mode !== "ats" || step !== "score" || !atsResult) {
      return;
    }

    if (trackedAtsUsageRef.current) return;
    trackedAtsUsageRef.current = true;
    void recordFeatureUsage("ats_resume_edit");
  }, [atsResult, mode, step, user?.id]);

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
    if (!user?.id || step !== "score" || !atsResult) return;

    let lastPromptAt = 0;
    try {
      lastPromptAt = Number(localStorage.getItem(FEEDBACK_PROMPT_LAST_AT_KEY));
    } catch {
      // ignore storage errors
    }

    if (
      Number.isFinite(lastPromptAt) &&
      Date.now() - lastPromptAt < FEEDBACK_PROMPT_COOLDOWN_MS
    ) {
      return;
    }

    try {
      localStorage.setItem(FEEDBACK_PROMPT_LAST_AT_KEY, String(Date.now()));
    } catch {
      // ignore storage errors
    }

    setFeedbackInitialTab("my");
    setShowFeedbackPanel(true);
    trackEvent("feedback_prompt_shown", {
      trigger: "ats_score",
      overall_score: atsResult.overallScore,
    });
  }, [atsResult, step, user?.id]);

  useEffect(() => {
    if (step !== "score" && step !== "editor") {
      setShowMobileResumePreview(false);
    }
  }, [step]);

  useEffect(() => {
    if (!modeToastMessage) return;
    const timeout = window.setTimeout(() => setModeToastMessage(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [modeToastMessage]);

  const analyzingPercent = useMemo(
    () => getAnalyzeProgressPercent(loadingMessage),
    [loadingMessage],
  );
  const analyzeCooldownRemaining = useMemo(
    () => (cooldownRemaining < 0 ? 0 : getRateLimitRemaining("analyze", 30000)),
    [cooldownRemaining],
  );
  const optimizeCooldownRemaining = useMemo(
    () =>
      cooldownRemaining < 0 ? 0 : getRateLimitRemaining("optimize", 30000),
    [cooldownRemaining],
  );
  const isAnalyzeCoolingDown = analyzeCooldownRemaining > 0;
  const isOptimizeCoolingDown = optimizeCooldownRemaining > 0;
  const experienceTier = useMemo(
    () => getExperienceTier(resumeData),
    [resumeData],
  );
  const autoModeLabel =
    experienceTier === "fresher"
      ? "Auto: single-page target"
      : "Auto: multi-page allowed";
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
          modeSelectionInProgressRef.current = false;
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
            modeSelectionInProgressRef.current = false;
            if (pendingMode === "ats") {
              setStep("input");
            } else {
              setStep("editor");
            }
          } else {
            if (modeSelectionInProgressRef.current) {
              return;
            }
            // Returning user with saved resume → straight to editor
            setMode("edit");
            setStep("editor");
          }
        } else if (pendingMode) {
          // No saved resume, but user picked a mode
          setMode(pendingMode);
          setPendingMode(null);
          modeSelectionInProgressRef.current = false;
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
          modeSelectionInProgressRef.current = false;
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
      }> = requireSinglePage
        ? [
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
          ]
        : [{ stage: "none", override: null }];

      let bestPages = Number.POSITIVE_INFINITY;
      let bestStage: CompressionStage = "none";
      let bestOverride: Partial<TemplateCustomization> | null = null;

      for (const attempt of fitAttempts) {
        setExportCustomizationOverride(attempt.override);
        await waitForNextPaint();

        const node = resumeRef.current;
        if (!node) {
          continue;
        }

        const estimatedPages = estimateRenderedPages(node);
        if (estimatedPages < bestPages) {
          bestPages = estimatedPages;
          bestStage = attempt.stage;
          bestOverride = attempt.override;
        }

        if (requireSinglePage && estimatedPages <= 1) {
          break;
        }
      }

      setExportCustomizationOverride(bestOverride);
      await waitForNextPaint();

      return {
        estimatedPages: Number.isFinite(bestPages) ? bestPages : 1,
        stage: bestStage,
        override: bestOverride,
      };
    },
    [],
  );

  const runExportPDF = useCallback(async () => {
    let el = resumeRef.current;
    if (!el) {
      setError("Resume preview not available for export. Please try again.");
      return;
    }
    if (resumeData) {
      const validation = validateForExport(resumeData);
      if (!validation.valid) {
        setError(validation.errors.join("\n"));
        return;
      }
      // Auto-fix typos before export
      if (validation.typoWarnings.length > 0) {
        const { fixed, corrections } = autoFixTypos(resumeData);
        if (corrections.length > 0) {
          setResumeData(fixed);
          setExportToastMessage(
            `Auto-fixed ${corrections.length} typo${corrections.length > 1 ? "s" : ""}: ${corrections.map((c) => c.split(": ")[1]).join(", ")}`,
          );
          // Brief pause so user sees the toast and the hidden template re-renders with fixed data
          await new Promise((r) => setTimeout(r, 600));

          // Re-acquire the freshly rendered DOM element
          el = resumeRef.current;
          if (!el) {
            setError(
              "Resume preview not available for export. Please try again.",
            );
            return;
          }
        }
      }
      setError(null);
    }

    const singlePageRequired =
      exportPageMode === "force-single-page" ||
      (exportPageMode === "auto" && experienceTier === "fresher");

    setIsExporting(true);
    setExportToastMessage("Preparing PDF...");

    let fitResult = await evaluatePdfFit(singlePageRequired);

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

      // User explicitly accepted multi-page output, so restore normal
      // layout and re-estimate using the same export surface that will print.
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
    setPreferredExportFormat("pdf");
    try {
      localStorage.setItem("preferred-export-format", "pdf");
    } catch {
      /* ignore */
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
    experienceTier,
    exportPageMode,
    privacySettings.embedResumeDataInPdf,
    resumeData,
    setError,
    setExportCustomizationOverride,
    setLastExportPageEstimate,
    setResumeData,
    reactToPrintFn,
    user?.id,
  ]);

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

  const handleExportPDF = useCallback(async () => {
    await requestExportWithFeedbackGate("pdf", runExportPDF);
  }, [requestExportWithFeedbackGate, runExportPDF]);

  /* ── Mode Selection (landing page) ───────────────── */

  const handleSelectMode = useCallback(
    (selectedMode: AppMode) => {
      modeSelectionInProgressRef.current = true;
      trackEvent("mode_selected", {
        mode: selectedMode,
        signed_in: Boolean(user),
      });
      if (!user) {
        if (isAuthStarting) return;
        setPendingMode(selectedMode);
        setModeToastMessage(
          `Selected: ${selectedMode === "ats" ? "ATS" : selectedMode === "edit" ? "Edit" : "Create"}`,
        );
        setIsAuthStarting(true);
        trackEvent("sign_in_initiated", { mode: selectedMode });
        if (authStartTimeoutRef.current) {
          window.clearTimeout(authStartTimeoutRef.current);
        }
        authStartTimeoutRef.current = window.setTimeout(() => {
          setIsAuthStarting(false);
          authStartTimeoutRef.current = null;
        }, 10000);
        openSignIn();
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
        setAtsResumeSource(resumeData ? "existing" : "new");
        setStep("input");
      } else {
        // edit mode
        if (resumeData) {
          setStep("editor");
        } else {
          setStep("input");
        }
      }
      modeSelectionInProgressRef.current = false;
      setModeToastMessage(
        `Selected: ${selectedMode === "ats" ? "ATS" : selectedMode === "edit" ? "Edit" : "Create"}`,
      );
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
      isAuthStarting,
      openSignIn,
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
      openSignIn();
    },
    [isAuthStarting, openSignIn],
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

    if (mode === "ats" && atsResumeSource === "new") {
      // New ATS upload should not reuse the currently saved resume in memory.
      setResumeData(null, false);
      setActiveResumeId(null);
      setActiveResumeName(null);
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
      detectTemplateStyle(sanitized)
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
      resetCooldown("analyze");
      setUploadedFileName(null);
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
      resetCooldown("analyze");
      setError(err instanceof Error ? err.message : "Parsing failed");
      setStep("input");
    } finally {
      clearRequestController("parse-resume");
    }
  };

  /* ── Analyze (ATS mode — resume + JD) ───────────────── */

  const handleAnalyze = async () => {
    const requireNewResumeInput = mode === "ats" && atsResumeSource === "new";
    const hasResumeText = resumeText.trim().length > 0;
    const hasUploadedResume = Boolean(uploadedFileName);
    const hasParsedResume = Boolean(resumeData);
    const hasNewResumeInput =
      hasResumeText || hasUploadedResume || hasParsedResume;

    if (requireNewResumeInput && !hasNewResumeInput) return;
    if (!requireNewResumeInput && !hasResumeText && !hasParsedResume) return;
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
        if (requireNewResumeInput) {
          setActiveResumeId(null);
          setActiveResumeName(null);
        }
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
      resetCooldown("analyze");
      setError(err instanceof Error ? err.message : "Analysis failed");
      setStep("input");
    } finally {
      clearRequestController("analyze");
    }
  };

  const handleBackToLanding = useCallback(() => {
    modeSelectionInProgressRef.current = false;
    setError(null);
    setMode(null);
    setStep("landing");
  }, [setError, setMode, setStep]);

  const handleSwitchMode = useCallback(
    (selectedMode: Exclude<AppMode, null>) => {
      if (selectedMode === mode) return;
      handleSelectMode(selectedMode);
    },
    [handleSelectMode, mode],
  );

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
      resetCooldown("analyze");
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
      resetCooldown("analyze");
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
      resetCooldown("optimize");
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
      resetCooldown("optimize");
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

  const runExportDocx = useCallback(async () => {
    if (!resumeData) {
      setError(
        "No resume data to export. Please create or load a resume first.",
      );
      return;
    }
    const validation = validateForExport(resumeData);
    if (!validation.valid) {
      setError(validation.errors.join("\n"));
      return;
    }
    // Auto-fix typos before export
    if (validation.typoWarnings.length > 0) {
      const { fixed, corrections } = autoFixTypos(resumeData);
      if (corrections.length > 0) {
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
      await exportToDocx(resumeData);
      trackEvent("resume_exported", { format: "docx" });
      if (user?.id) {
        void recordFeatureUsage("resume_download");
      }
      setPreferredExportFormat("docx");
      try {
        localStorage.setItem("preferred-export-format", "docx");
      } catch {
        /* ignore */
      }
    } catch (err) {
      trackEvent("resume_export_failed", { format: "docx" });
      setError(err instanceof Error ? err.message : "DOCX export failed");
    } finally {
      setIsExporting(false);
      setExportToastMessage(null);
    }
  }, [resumeData, setError, setResumeData, user?.id]);

  const handleExportDocx = useCallback(async () => {
    await requestExportWithFeedbackGate("docx", runExportDocx);
  }, [requestExportWithFeedbackGate, runExportDocx]);

  const handleFeedbackSubmitted = useCallback(() => {
    if (!pendingExportFormat) return;

    const format = pendingExportFormat;
    setPendingExportFormat(null);
    setShowFeedbackPanel(false);
    trackEvent("feedback_export_gate_completed", { format });

    if (format === "pdf") {
      void runExportPDF();
      return;
    }

    void runExportDocx();
  }, [pendingExportFormat, runExportDocx, runExportPDF]);

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
          <h1 className="app-title">{t("app.title")}</h1>
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

          <ThemeToggle />

          <SignedIn>
            {step !== "landing" && step !== "analyzing" && (
              <div
                className="mode-switch"
                role="group"
                aria-label="Switch mode"
              >
                <button
                  className={`header-btn ${mode === "ats" ? "btn-accent" : ""}`}
                  onClick={() => handleSwitchMode("ats")}
                >
                  ATS
                </button>
                <button
                  className={`header-btn ${mode === "edit" ? "btn-accent" : ""}`}
                  onClick={() => handleSwitchMode("edit")}
                >
                  Edit
                </button>
                <button
                  className={`header-btn ${mode === "create" ? "btn-accent" : ""}`}
                  onClick={() => handleSwitchMode("create")}
                >
                  Create
                </button>
              </div>
            )}
          </SignedIn>

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

          <SignedIn>
            {isAdminUser && step !== "analyzing" && (
              <button
                className="header-btn"
                onClick={() => {
                  setPendingExportFormat(null);
                  setFeedbackInitialTab("admin");
                  setShowFeedbackPanel(true);
                  trackEvent("feedback_panel_opened", { tab: "admin" });
                }}
                title="Feedback Admin"
                aria-label="Feedback Admin"
              >
                <Shield size={14} />
                <span>Admin</span>
              </button>
            )}
          </SignedIn>

          {step !== "landing" && step !== "analyzing" && (
            <button className="header-btn" onClick={handleStartOver}>
              <RotateCcw size={14} />
              <span>{t("header.startOver")}</span>
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
                    <span>{t("header.newJD")}</span>
                  </button>
                </>
              )}

              <div className="settings-menu">
                <button
                  ref={settingsMenuButtonRef}
                  className={`header-btn ${isSettingsMenuOpen ? "btn-accent" : ""}`}
                  onClick={() => setIsSettingsMenuOpen((prev) => !prev)}
                  title={t("header.moreActions")}
                  aria-label={t("header.moreActions")}
                  aria-haspopup="menu"
                  aria-expanded={isSettingsMenuOpen}
                >
                  <Settings size={14} />
                </button>

                {isSettingsMenuOpen && (
                  <div
                    className="settings-dropdown"
                    role="menu"
                    ref={settingsMenuRef}
                    style={{
                      top: `${settingsMenuPosition.top}px`,
                      left: `${settingsMenuPosition.left}px`,
                    }}
                  >
                    {step === "editor" && (
                      <>
                        <button
                          className="settings-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setIsSettingsMenuOpen(false);
                            handleLoadJSON();
                          }}
                        >
                          <Upload size={14} />
                          <span>{t("header.loadJSON")}</span>
                        </button>
                        <button
                          className="settings-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setIsSettingsMenuOpen(false);
                            handleSaveJSON();
                          }}
                        >
                          <Save size={14} />
                          <span>{t("header.saveJSON")}</span>
                        </button>
                        <button
                          className="settings-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setIsSettingsMenuOpen(false);
                            handleSelfScore();
                          }}
                          title="Score resume on general best practices (no JD needed)"
                        >
                          <Trophy size={14} />
                          <span>{t("header.selfScore")}</span>
                        </button>
                        <button
                          className="settings-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setIsSettingsMenuOpen(false);
                            handleReAnalyze();
                          }}
                        >
                          <Search size={14} />
                          <span>{t("header.reAnalyze")}</span>
                        </button>
                        <button
                          className="settings-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setIsSettingsMenuOpen(false);
                            setShowCoverLetter(true);
                          }}
                          title="Generate Cover Letter"
                        >
                          <Mail size={14} />
                          <span>{t("header.coverLetter")}</span>
                        </button>
                      </>
                    )}

                    <div
                      className="settings-menu-group"
                      role="group"
                      aria-label="PDF page mode"
                    >
                      <div className="settings-menu-label">PDF Page Mode</div>
                      <button
                        className={`settings-menu-item settings-menu-item-compact ${
                          exportPageMode === "auto" ? "is-active" : ""
                        }`}
                        role="menuitemradio"
                        aria-checked={exportPageMode === "auto"}
                        onClick={() => setExportPageMode("auto")}
                        title={autoModeLabel}
                      >
                        {exportPageMode === "auto" ? (
                          <CheckCircle2 size={14} />
                        ) : (
                          <PlusCircle size={14} />
                        )}
                        <span>{autoModeLabel}</span>
                      </button>
                      <button
                        className={`settings-menu-item settings-menu-item-compact ${
                          exportPageMode === "force-single-page"
                            ? "is-active"
                            : ""
                        }`}
                        role="menuitemradio"
                        aria-checked={exportPageMode === "force-single-page"}
                        onClick={() => setExportPageMode("force-single-page")}
                        title="Always target one page"
                      >
                        {exportPageMode === "force-single-page" ? (
                          <CheckCircle2 size={14} />
                        ) : (
                          <PlusCircle size={14} />
                        )}
                        <span>Force single page</span>
                      </button>
                      <button
                        className={`settings-menu-item settings-menu-item-compact ${
                          exportPageMode === "allow-multi-page"
                            ? "is-active"
                            : ""
                        }`}
                        role="menuitemradio"
                        aria-checked={exportPageMode === "allow-multi-page"}
                        onClick={() => setExportPageMode("allow-multi-page")}
                        title="Allow two or more pages"
                      >
                        {exportPageMode === "allow-multi-page" ? (
                          <CheckCircle2 size={14} />
                        ) : (
                          <PlusCircle size={14} />
                        )}
                        <span>Allow multi-page</span>
                      </button>
                      {lastExportPageEstimate !== null && (
                        <div className="settings-menu-hint">
                          Last estimate: {lastExportPageEstimate} page
                          {lastExportPageEstimate > 1 ? "s" : ""}
                        </div>
                      )}
                    </div>

                    <button
                      className="settings-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setIsSettingsMenuOpen(false);
                        handleExportDocx();
                      }}
                      disabled={isExporting}
                      title="Export as DOCX"
                    >
                      <FileType size={14} />
                      <span>{t("header.docx")}</span>
                    </button>
                  </div>
                )}
              </div>

              <button
                className={`header-btn ${preferredExportFormat === "pdf" ? "btn-primary" : ""}`}
                onClick={handleExportPDF}
                disabled={isExporting}
              >
                <Download size={14} />
                <span>{t("header.exportPDF")}</span>
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

      {modeToastMessage && (
        <div className="mode-toast" role="status" aria-live="polite">
          {modeToastMessage}
        </div>
      )}

      {/* Export progress toast */}
      {exportToastMessage && (
        <div className="export-toast" role="status" aria-live="polite">
          <span className="export-toast-spinner" />
          {exportToastMessage}
        </div>
      )}

      {/* Step Indicator — only for active flows (not landing) */}
      {mode && step !== "analyzing" && step !== "landing" && (
        <>
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

          <div
            className="flow-toolbar"
            role="toolbar"
            aria-label="Quick actions"
          >
            <div className="flow-toolbar-group">
              {step === "editor" && (
                <>
                  <button
                    className="header-btn flow-btn"
                    onClick={undo}
                    disabled={!canUndo()}
                    title="Undo (Ctrl+Z)"
                    aria-label="Undo"
                  >
                    <Undo2 size={14} />
                    <span>Back</span>
                  </button>
                  <button
                    className="header-btn flow-btn"
                    onClick={redo}
                    disabled={!canRedo()}
                    title="Redo (Ctrl+Y)"
                    aria-label="Redo"
                  >
                    <Redo2 size={14} />
                    <span>Forward</span>
                  </button>
                </>
              )}
            </div>

            <div className="flow-toolbar-group flow-toolbar-right">
              <button
                className="header-btn header-btn-labeled flow-btn"
                onClick={() => setShowTemplatePicker(true)}
                title="Templates & Style"
                aria-label="Templates & Style"
              >
                <Palette size={14} />
                <span>Templates & Style</span>
              </button>

              <button
                className="header-btn header-btn-labeled flow-btn"
                onClick={() => setShowResumeManager(true)}
                title="Files"
                aria-label="Files"
              >
                <FolderOpen size={14} />
                <span>Files</span>
              </button>
            </div>
          </div>
        </>
      )}

      {isCompactScreen &&
        mode &&
        step !== "analyzing" &&
        step !== "landing" && (
          <nav className="mobile-breadcrumb" aria-label="Current flow">
            <button
              className="mobile-breadcrumb-home"
              onClick={handleBackToLanding}
            >
              Home
            </button>
            {getStepConfig().map((s) => (
              <span
                key={`crumb-${s.key}`}
                className={`mobile-breadcrumb-item ${getStepStatus(s.key)}`}
              >
                <ChevronRight size={12} />
                {s.label}
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
                    ...(atsResult.breakdown.skillsAlignment.matchedSkills ||
                      []),
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
                    ...(atsResult.breakdown.skillsAlignment.missingSkills ||
                      []),
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
                    disabled={isOptimizeCoolingDown}
                  >
                    {isOptimizeCoolingDown ? (
                      <>
                        <Clock size={18} />
                        Wait {formatCooldown(optimizeCooldownRemaining)}
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
                  <div className="mobile-export-row">
                    <button
                      className="btn-secondary mobile-export-btn"
                      onClick={handleExportDocx}
                      disabled={isExporting}
                    >
                      <FileType size={14} /> DOCX
                    </button>
                    <button
                      className="btn-primary-mobile mobile-export-btn"
                      onClick={handleExportPDF}
                      disabled={isExporting}
                    >
                      <Download size={14} /> Export PDF
                    </button>
                  </div>
                </div>
              )}
            </div>

            {!isCompactScreen && (
              <div className="score-right">
                <div className="preview-container">
                  <ErrorBoundary>
                    <Suspense fallback={<PreviewSkeleton />}>
                      <ResumeTemplate data={resumeData} />
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
                  <div className="mobile-export-row">
                    <button
                      className="btn-secondary mobile-export-btn"
                      onClick={handleExportDocx}
                      disabled={isExporting}
                    >
                      <FileType size={14} /> DOCX
                    </button>
                    <button
                      className="btn-primary-mobile mobile-export-btn"
                      onClick={handleExportPDF}
                      disabled={isExporting}
                    >
                      <Download size={14} /> Export PDF
                    </button>
                  </div>
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
                      <ResumeTemplate data={resumeData} />
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
                        <ResumeTemplate data={resumeData} />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                </div>
              </div>
            </div>
          )}
      </main>

      {/* Hidden off-screen ResumeTemplate — always mounted for PDF export */}
      {resumeData && (
        <div
          style={{
            position: "fixed",
            left: "-9999px",
            top: 0,
            width: "210mm",
            opacity: 0,
            pointerEvents: "none",
            zIndex: -1,
          }}
          aria-hidden="true"
        >
          <ErrorBoundary>
            <Suspense fallback={null}>
              <ResumeTemplate
                ref={resumeRef}
                data={resumeData}
                customizationOverride={exportCustomizationOverride || undefined}
                forExport
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}

      <SignedIn>
        {!showFeedbackPanel && step !== "analyzing" && (
          <button
            className="floating-feedback-cta"
            onClick={() => {
              setPendingExportFormat(null);
              setFeedbackInitialTab("my");
              setShowFeedbackPanel(true);
              trackEvent("feedback_panel_opened", {
                tab: "my",
                source: "floating_cta",
              });
            }}
            title="Give Feedback"
            aria-label="Give Feedback"
          >
            <MessageSquare size={18} />
            <span>Give Feedback</span>
          </button>
        )}
      </SignedIn>

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
      {showResumeManager && (
        <Suspense fallback={null}>
          <ResumeManagerPanel onClose={() => setShowResumeManager(false)} />
        </Suspense>
      )}
      {showFeedbackPanel && user?.id && userEmail && (
        <Suspense fallback={null}>
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
            isAdmin={isAdminUser}
            initialTab={feedbackInitialTab}
            requireFeedbackForDownload={Boolean(pendingExportFormat)}
            onFeedbackSubmitted={handleFeedbackSubmitted}
          />
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
