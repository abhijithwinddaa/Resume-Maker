/* ─── LocalStorage Resume Backup ──────────────────────
   Auto-saves resume data to localStorage as a fallback
   in case Supabase is unreachable.
   ────────────────────────────────────────────────────── */

import type { ResumeData } from "../types/resume";
import { normalizeResumeData } from "./normalizeResume";

const BACKUP_KEY = "resume_backup";
const BACKUP_JD_KEY = "resume_backup_jd";
const BACKUP_TIMESTAMP_KEY = "resume_backup_ts";
const BACKUP_META_KEY = "resume_backup_meta";

// localStorage throws in Safari private mode / when blocked; never let that
// escape into a render or an event handler.
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export interface BackupMeta {
  resumeId: string | null;
  name: string | null;
}

/**
 * Save resume data to localStorage backup.
 */
export function saveLocalBackup(
  resumeData: ResumeData,
  jdText?: string,
  meta?: BackupMeta,
): void {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(resumeData));
    localStorage.setItem(BACKUP_TIMESTAMP_KEY, Date.now().toString());
    if (meta) localStorage.setItem(BACKUP_META_KEY, JSON.stringify(meta));
    if (jdText !== undefined) {
      localStorage.setItem(BACKUP_JD_KEY, jdText);
    }
  } catch {
    // localStorage full — silently fail
    console.warn("localStorage backup failed — storage may be full.");
  }
}

/**
 * Load resume data from localStorage backup.
 * Returns null if no backup exists.
 */
export function loadLocalBackup(): {
  resumeData: ResumeData;
  jdText: string;
  timestamp: number;
  resumeId: string | null;
  name: string | null;
} | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;

    const resumeData = normalizeResumeData(JSON.parse(raw));
    const jdText = localStorage.getItem(BACKUP_JD_KEY) || "";
    const timestamp = parseInt(
      localStorage.getItem(BACKUP_TIMESTAMP_KEY) || "0",
      10,
    );

    let resumeId: string | null = null;
    let name: string | null = null;
    try {
      const meta = JSON.parse(localStorage.getItem(BACKUP_META_KEY) || "null");
      if (meta && typeof meta.resumeId === "string") resumeId = meta.resumeId;
      if (meta && typeof meta.name === "string") name = meta.name;
    } catch {
      /* no usable meta */
    }

    return { resumeData, jdText, timestamp, resumeId, name };
  } catch {
    return null;
  }
}

/**
 * Check if a local backup exists.
 */
export function hasLocalBackup(): boolean {
  return safeGet(BACKUP_KEY) !== null;
}

/**
 * Get the timestamp of the last backup.
 */
export function getBackupTimestamp(): Date | null {
  const ts = safeGet(BACKUP_TIMESTAMP_KEY);
  if (!ts) return null;
  return new Date(parseInt(ts, 10));
}

/**
 * Clear the localStorage backup.
 */
export function clearLocalBackup(): void {
  safeRemove(BACKUP_KEY);
  safeRemove(BACKUP_JD_KEY);
  safeRemove(BACKUP_TIMESTAMP_KEY);
  safeRemove(BACKUP_META_KEY);
}

/**
 * Format backup age as human-readable string.
 */
export function formatBackupAge(timestamp: number): string {
  const ageMs = Date.now() - timestamp;
  const seconds = Math.floor(ageMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} min${minutes > 1 ? "s" : ""} ago`;
  return "just now";
}
