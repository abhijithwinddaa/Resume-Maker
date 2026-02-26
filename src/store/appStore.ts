import { create } from "zustand";
import type { ResumeData } from "../types/resume";
import type { ATSResult, OptimizeProgress } from "../utils/aiService";
import type { TemplateId, TemplateCustomization } from "../types/templates";
import { DEFAULT_CUSTOMIZATION } from "../types/templates";
import type { AISettings } from "../types/aiSettings";
import {
  DEFAULT_AI_SETTINGS,
  loadAISettings,
  saveAISettings,
} from "../types/aiSettings";
import type { DetectedStyle } from "../utils/templateDetector";

// ─── Undo/Redo History ───────────────────────────────
const MAX_HISTORY = 50;

interface HistoryState {
  past: ResumeData[];
  future: ResumeData[];
}

// ─── Cover Letter ────────────────────────────────────
export interface CoverLetterData {
  content: string;
  companyName: string;
  position: string;
}

// ─── Multi-resume ────────────────────────────────────
export interface ResumeMeta {
  id: string;
  name: string;
  updatedAt: number;
  templateId: TemplateId;
}

export type AppStep = "input" | "analyzing" | "score" | "editor";
export type ThemeMode = "light" | "dark" | "system";

interface AppState {
  // ─── Core State ─────────────────────────
  step: AppStep;
  resumeText: string;
  jdText: string;
  resumeData: ResumeData | null;
  atsResult: ATSResult | null;
  isOptimizing: boolean;
  optimizeProgress: OptimizeProgress | null;
  previousScore: number | null;
  loadingMessage: string;
  error: string | null;
  optimizeDone: boolean;
  uploadedFileName: string | null;
  isPdfLoading: boolean;
  isSaving: boolean;
  isDbLoading: boolean;
  cooldownRemaining: number;
  hasBackup: boolean;

  // ─── Template ───────────────────────────
  templateId: TemplateId;
  customization: TemplateCustomization;

  // ─── Detected Style (from uploaded PDF) ─
  detectedStyle: DetectedStyle | null;
  originalPdfUrl: string | null;
  showOriginalPdf: boolean;

  // ─── Theme ──────────────────────────────
  theme: ThemeMode;

  // ─── AI Settings ────────────────────────
  aiSettings: AISettings;

  // ─── Multi-resume ──────────────────────
  resumes: ResumeMeta[];
  activeResumeId: string | null;

  // ─── Cover Letter ─────────────────────
  coverLetter: CoverLetterData | null;
  isGeneratingCoverLetter: boolean;

  // ─── Undo/Redo ────────────────────────
  history: HistoryState;

  // ─── Actions ──────────────────────────────
  setStep: (step: AppStep) => void;
  setResumeText: (text: string) => void;
  setJdText: (text: string) => void;
  setResumeData: (data: ResumeData | null, recordHistory?: boolean) => void;
  setATSResult: (result: ATSResult | null) => void;
  setIsOptimizing: (v: boolean) => void;
  setOptimizeProgress: (p: OptimizeProgress | null) => void;
  setPreviousScore: (s: number | null) => void;
  setLoadingMessage: (msg: string) => void;
  setError: (err: string | null) => void;
  setOptimizeDone: (v: boolean) => void;
  setUploadedFileName: (name: string | null) => void;
  setIsPdfLoading: (v: boolean) => void;
  setIsSaving: (v: boolean) => void;
  setIsDbLoading: (v: boolean) => void;
  setCooldownRemaining: (v: number) => void;
  setHasBackup: (v: boolean) => void;

  // Template actions
  setTemplateId: (id: TemplateId) => void;
  setCustomization: (c: Partial<TemplateCustomization>) => void;

  // Detected style actions
  setDetectedStyle: (style: DetectedStyle | null) => void;
  applyDetectedStyle: () => void;
  setOriginalPdfUrl: (url: string | null) => void;
  setShowOriginalPdf: (v: boolean) => void;

  // Theme actions
  setTheme: (theme: ThemeMode) => void;

  // AI Settings actions
  setAISettings: (settings: Partial<AISettings>) => void;

  // Multi-resume actions
  setResumes: (resumes: ResumeMeta[]) => void;
  setActiveResumeId: (id: string | null) => void;

  // Cover letter actions
  setCoverLetter: (cl: CoverLetterData | null) => void;
  setIsGeneratingCoverLetter: (v: boolean) => void;

  // Undo/Redo actions
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Composite actions
  startOver: () => void;
  newJD: () => void;
}

function loadTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem("theme-mode");
    if (saved === "dark" || saved === "light" || saved === "system")
      return saved;
  } catch {
    /* ignore */
  }
  return "system";
}

function loadTemplateId(): TemplateId {
  try {
    const saved = localStorage.getItem("template-id");
    if (saved) return saved as TemplateId;
  } catch {
    /* ignore */
  }
  return "classic";
}

function loadCustomization(): TemplateCustomization {
  try {
    const saved = localStorage.getItem("template-customization");
    if (saved) return { ...DEFAULT_CUSTOMIZATION, ...JSON.parse(saved) };
  } catch {
    /* ignore */
  }
  return DEFAULT_CUSTOMIZATION;
}

export const useAppStore = create<AppState>((set, get) => ({
  // ─── Initial State ──────────────────
  step: "input",
  resumeText: "",
  jdText: "",
  resumeData: null,
  atsResult: null,
  isOptimizing: false,
  optimizeProgress: null,
  previousScore: null,
  loadingMessage: "",
  error: null,
  optimizeDone: false,
  uploadedFileName: null,
  isPdfLoading: false,
  isSaving: false,
  isDbLoading: false,
  cooldownRemaining: 0,
  hasBackup: false,

  templateId: loadTemplateId(),
  customization: loadCustomization(),
  detectedStyle: null,
  originalPdfUrl: null,
  showOriginalPdf: false,
  theme: loadTheme(),
  aiSettings: loadAISettings(),
  resumes: [],
  activeResumeId: null,
  coverLetter: null,
  isGeneratingCoverLetter: false,
  history: { past: [], future: [] },

  // ─── Simple Setters ─────────────────
  setStep: (step) => set({ step }),
  setResumeText: (resumeText) => set({ resumeText }),
  setJdText: (jdText) => set({ jdText }),
  setResumeData: (data, recordHistory = true) => {
    const state = get();
    if (recordHistory && state.resumeData && data) {
      const past = [...state.history.past, state.resumeData].slice(
        -MAX_HISTORY,
      );
      set({ resumeData: data, history: { past, future: [] } });
    } else {
      set({ resumeData: data });
    }
  },
  setATSResult: (atsResult) => set({ atsResult }),
  setIsOptimizing: (isOptimizing) => set({ isOptimizing }),
  setOptimizeProgress: (optimizeProgress) => set({ optimizeProgress }),
  setPreviousScore: (previousScore) => set({ previousScore }),
  setLoadingMessage: (loadingMessage) => set({ loadingMessage }),
  setError: (error) => set({ error }),
  setOptimizeDone: (optimizeDone) => set({ optimizeDone }),
  setUploadedFileName: (uploadedFileName) => set({ uploadedFileName }),
  setIsPdfLoading: (isPdfLoading) => set({ isPdfLoading }),
  setIsSaving: (isSaving) => set({ isSaving }),
  setIsDbLoading: (isDbLoading) => set({ isDbLoading }),
  setCooldownRemaining: (cooldownRemaining) => set({ cooldownRemaining }),
  setHasBackup: (hasBackup) => set({ hasBackup }),

  // Template
  setTemplateId: (templateId) => {
    localStorage.setItem("template-id", templateId);
    set({ templateId });
  },
  setCustomization: (partial) => {
    const merged = { ...get().customization, ...partial };
    localStorage.setItem("template-customization", JSON.stringify(merged));
    set({ customization: merged });
  },

  // Detected style
  setDetectedStyle: (detectedStyle) => set({ detectedStyle }),
  applyDetectedStyle: () => {
    const { detectedStyle } = get();
    if (!detectedStyle) return;
    const { templateId, customization } = detectedStyle;
    localStorage.setItem("template-id", templateId);
    localStorage.setItem(
      "template-customization",
      JSON.stringify(customization),
    );
    set({ templateId, customization });
  },
  setOriginalPdfUrl: (originalPdfUrl) => {
    // Revoke previous blob URL to prevent memory leaks
    const prev = get().originalPdfUrl;
    if (prev) {
      try {
        URL.revokeObjectURL(prev);
      } catch {
        /* ignore */
      }
    }
    set({ originalPdfUrl });
  },
  setShowOriginalPdf: (showOriginalPdf) => set({ showOriginalPdf }),

  // Theme
  setTheme: (theme) => {
    localStorage.setItem("theme-mode", theme);
    set({ theme });
  },

  // AI Settings
  setAISettings: (partial) => {
    const merged = { ...get().aiSettings, ...partial };
    saveAISettings(merged);
    set({ aiSettings: merged });
  },

  // Multi-resume
  setResumes: (resumes) => set({ resumes }),
  setActiveResumeId: (activeResumeId) => set({ activeResumeId }),

  // Cover letter
  setCoverLetter: (coverLetter) => set({ coverLetter }),
  setIsGeneratingCoverLetter: (isGeneratingCoverLetter) =>
    set({ isGeneratingCoverLetter }),

  // Undo/Redo
  undo: () => {
    const { history, resumeData } = get();
    if (history.past.length === 0) return;
    const prev = history.past[history.past.length - 1];
    const newPast = history.past.slice(0, -1);
    const newFuture = resumeData
      ? [resumeData, ...history.future].slice(0, MAX_HISTORY)
      : history.future;
    set({ resumeData: prev, history: { past: newPast, future: newFuture } });
  },
  redo: () => {
    const { history, resumeData } = get();
    if (history.future.length === 0) return;
    const next = history.future[0];
    const newFuture = history.future.slice(1);
    const newPast = resumeData
      ? [...history.past, resumeData].slice(-MAX_HISTORY)
      : history.past;
    set({ resumeData: next, history: { past: newPast, future: newFuture } });
  },
  canUndo: () => get().history.past.length > 0,
  canRedo: () => get().history.future.length > 0,

  // Composite
  startOver: () =>
    set({
      step: "input",
      resumeData: null,
      atsResult: null,
      optimizeProgress: null,
      error: null,
      previousScore: null,
      optimizeDone: false,
      isOptimizing: false,
      uploadedFileName: null,
      jdText: "",
      resumeText: "",
      coverLetter: null,
      history: { past: [], future: [] },
      detectedStyle: null,
      originalPdfUrl: null,
      showOriginalPdf: false,
    }),
  newJD: () =>
    set({
      jdText: "",
      atsResult: null,
      optimizeProgress: null,
      error: null,
      previousScore: null,
      optimizeDone: false,
      isOptimizing: false,
      step: "input",
      coverLetter: null,
    }),
}));
