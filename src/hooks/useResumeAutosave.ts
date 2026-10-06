/* ─── Resume autosave ──────────────────────────────────
   Every save is bound to the resume it belongs to when it
   is SCHEDULED (not when the timer fires), saves run one at
   a time, and the latest data always wins. Failures surface
   as an "error" status and are retried.
   ────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResumeData } from "../types/resume";
import { saveResume } from "../services/resumeService";
import { useAppStore } from "../store/appStore";
import { saveLocalBackup } from "../utils/localBackup";

export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface SavedRow {
  id: string;
  name?: string;
}

export type SaveFn = (
  userId: string,
  data: ResumeData,
  options: { resumeId?: string; name?: string },
) => Promise<SavedRow | null>;

interface Job {
  key: string;
  userId: string;
  data: ResumeData;
  /** Resume id at schedule time; null = a new resume not yet inserted. */
  resumeId: string | null;
  name: string | undefined;
  epoch: number;
}

export interface SavedInfo {
  /** The save created a new row. */
  created: boolean;
  /** The saved resume is still the one the user is looking at. */
  current: boolean;
}

export interface AutosaveOptions {
  save: SaveFn;
  delay?: number;
  retryDelay?: number;
  onStatus?: (status: AutosaveStatus) => void;
  onSaved?: (row: SavedRow, info: SavedInfo) => void;
  onFailed?: (error: unknown) => void;
}

export class AutosaveController {
  private pending = new Map<string, Job>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private epoch = 0;
  private created = new Map<number, string>();
  private discarded = new Set<string>();
  private failed = false;
  private saved = false;
  private retryDelay: number;
  private lastStatus: AutosaveStatus = "idle";
  private destroyed = false;
  private opts: AutosaveOptions;

  constructor(opts: AutosaveOptions) {
    this.opts = opts;
    this.retryDelay = opts.retryDelay ?? 4000;
  }

  get status(): AutosaveStatus {
    if (this.running) return "saving";
    if (this.failed && this.pending.size > 0) return "error";
    if (this.pending.size > 0) return "dirty";
    return this.saved ? "saved" : "idle";
  }

  hasUnsaved(): boolean {
    return this.pending.size > 0 || this.running !== null;
  }

  private emit() {
    const s = this.status;
    if (s !== this.lastStatus) {
      this.lastStatus = s;
      this.opts.onStatus?.(s);
    }
  }

  /** Queue a save for `resumeId` (null = new resume) with this exact data. */
  schedule(
    userId: string,
    data: ResumeData,
    resumeId: string | null,
    name?: string,
  ) {
    if (this.destroyed) return;
    const key = resumeId ?? `draft:${this.epoch}`;
    this.pending.delete(key); // re-insert so newest data is also newest in order
    this.pending.set(key, {
      key,
      userId,
      data,
      resumeId,
      name,
      epoch: this.epoch,
    });
    this.saved = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.drain();
    }, this.opts.delay ?? 500);
    this.emit();
  }

  /** A different resume is now showing; later drafts belong to a new row. */
  bumpEpoch() {
    this.epoch += 1;
    if (this.pending.size === 0 && !this.running) this.saved = false;
    this.emit();
  }

  /** Save everything pending now. Resolves when the queue is drained. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    await this.drain();
  }

  /** Drop everything pending without saving. */
  cancel() {
    if (this.timer) clearTimeout(this.timer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.timer = this.retryTimer = null;
    this.pending.clear();
    this.failed = false;
    this.emit();
  }

  /** Forget pending/failed saves for a resume (e.g. it was deleted). */
  discard(resumeId: string) {
    this.discarded.add(resumeId);
    this.pending.delete(resumeId);
    for (const [key, job] of this.pending) {
      if (job.resumeId === null && this.created.get(job.epoch) === resumeId) {
        this.pending.delete(key);
      }
    }
    if (this.pending.size === 0) this.failed = false;
    this.emit();
  }

  /** Stop timers; anything already pending is left for a final flush(). */
  destroy() {
    if (this.timer) clearTimeout(this.timer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.timer = this.retryTimer = null;
    this.destroyed = true;
  }

  private drain(): Promise<void> {
    if (this.running) return this.running;
    if (this.pending.size === 0) return Promise.resolve();
    this.running = this.loop().finally(() => {
      this.running = null;
      this.emit();
    });
    this.emit();
    return this.running;
  }

  private async loop() {
    while (this.pending.size > 0) {
      const [key, job] = this.pending.entries().next().value as [string, Job];
      this.pending.delete(key);
      const id = job.resumeId ?? this.created.get(job.epoch) ?? null;
      if (id && this.discarded.has(id)) continue;
      this.emit();

      let row: SavedRow | null = null;
      try {
        row = await this.opts.save(job.userId, job.data, {
          resumeId: id ?? undefined,
          name: job.name,
        });
      } catch (err) {
        this.opts.onFailed?.(err);
      }

      if (!row) {
        this.failed = true;
        // Keep the data for the retry unless something newer superseded it.
        if (!this.pending.has(key) && !(id && this.discarded.has(id))) {
          this.pending.set(key, job);
        }
        this.scheduleRetry();
        return;
      }

      this.failed = false;
      this.retryDelay = this.opts.retryDelay ?? 4000;
      if (!id) this.created.set(job.epoch, row.id);
      this.opts.onSaved?.(row, {
        created: !id,
        current: job.epoch === this.epoch,
      });
    }
    this.saved = true;
  }

  private scheduleRetry() {
    if (this.retryTimer || this.destroyed) return;
    const wait = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, 30000);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.drain();
    }, wait);
  }
}

/* ── Module registry so non-hook code can flush/discard ── */
let activeController: AutosaveController | null = null;

export function flushPendingSave(): Promise<void> {
  return activeController ? activeController.flush() : Promise.resolve();
}

export function discardPendingSave(resumeId: string) {
  activeController?.discard(resumeId);
}

/* ── Hook ─────────────────────────────────────────────── */

interface HookOptions {
  userId: string | undefined;
  save?: SaveFn;
  onSaved?: (row: SavedRow, info: SavedInfo) => void;
  onFailed?: (error: unknown) => void;
}

export function useResumeAutosave({
  userId,
  save = saveResume as SaveFn,
  onSaved,
  onFailed,
}: HookOptions) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const ctrlRef = useRef<AutosaveController | null>(null);
  const userIdRef = useRef(userId);
  const cbRef = useRef({ onSaved, onFailed });
  const saveRef = useRef(save);
  useEffect(() => {
    userIdRef.current = userId;
    cbRef.current = { onSaved, onFailed };
    saveRef.current = save;
  });

  /** Persist this data for the resume that is active RIGHT NOW. */
  const persist = useCallback((data: ResumeData) => {
    const state = useAppStore.getState();
    if (state.privacySettings.saveLocalBackups) {
      saveLocalBackup(data, state.jdText, {
        resumeId: state.activeResumeId,
        name: state.activeResumeName,
      });
      state.setHasBackup(true);
    }
    const uid = userIdRef.current;
    if (!uid) return;
    ctrlRef.current?.schedule(
      uid,
      data,
      state.activeResumeId,
      state.activeResumeName ?? undefined,
    );
  }, []);

  useEffect(() => {
    const ctrl = new AutosaveController({
      save: (...args) => saveRef.current(...args),
      onStatus: (s) => {
        setStatus(s);
        useAppStore.getState().setIsSaving(s === "saving");
      },
      onSaved: (row, info) => {
        if (info.current && info.created) {
          const st = useAppStore.getState();
          if (st.activeResumeId === null) {
            st.setActiveResumeId(row.id);
            st.setActiveResumeName(row.name || "Untitled Resume");
          }
        }
        cbRef.current.onSaved?.(row, info);
      },
      onFailed: (err) => cbRef.current.onFailed?.(err),
    });
    ctrlRef.current = ctrl;
    activeController = ctrl;

    // Every content change of the active resume (typing, undo/redo, AI
    // apply, export auto-fix) lands here; loads bump loadEpoch instead.
    const unsubscribe = useAppStore.subscribe((state, prev) => {
      if (state.loadEpoch !== prev.loadEpoch) {
        void ctrl.flush();
        ctrl.bumpEpoch();
        return;
      }
      if (state.resumeData && state.resumeData !== prev.resumeData) {
        persist(state.resumeData);
      }
    });

    const flush = () => void ctrl.flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unsubscribe();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      void ctrl.flush();
      ctrl.destroy();
      if (activeController === ctrl) activeController = null;
      if (ctrlRef.current === ctrl) ctrlRef.current = null;
    };
  }, [persist]);

  return { status, persist };
}
