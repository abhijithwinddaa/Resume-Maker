/* ─── LocalStorage Resume Backup ──────────────────────
   Auto-saves resume data to localStorage as a fallback
   in case Supabase is unreachable.
   ────────────────────────────────────────────────────── */

import type { ResumeData } from "../types/resume";

const BACKUP_KEY = "resume_backup";
const BACKUP_JD_KEY = "resume_backup_jd";
const BACKUP_TIMESTAMP_KEY = "resume_backup_ts";

/**
 * Save resume data to localStorage backup.
 */
export function saveLocalBackup(resumeData: ResumeData, jdText?: string): void {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(resumeData));
    localStorage.setItem(BACKUP_TIMESTAMP_KEY, Date.now().toString());
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
} | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;

    const resumeData = JSON.parse(raw) as ResumeData;
    const jdText = localStorage.getItem(BACKUP_JD_KEY) || "";
    const timestamp = parseInt(
      localStorage.getItem(BACKUP_TIMESTAMP_KEY) || "0",
      10,
    );

    return { resumeData, jdText, timestamp };
  } catch {
    return null;
  }
}

/**
 * Check if a local backup exists.
 */
export function hasLocalBackup(): boolean {
  return localStorage.getItem(BACKUP_KEY) !== null;
}

/**
 * Get the timestamp of the last backup.
 */
export function getBackupTimestamp(): Date | null {
  const ts = localStorage.getItem(BACKUP_TIMESTAMP_KEY);
  if (!ts) return null;
  return new Date(parseInt(ts, 10));
}

/**
 * Clear the localStorage backup.
 */
export function clearLocalBackup(): void {
  localStorage.removeItem(BACKUP_KEY);
  localStorage.removeItem(BACKUP_JD_KEY);
  localStorage.removeItem(BACKUP_TIMESTAMP_KEY);
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
