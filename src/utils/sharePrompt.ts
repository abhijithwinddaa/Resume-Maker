/**
 * When the app may *offer* sharing on its own (after a download). Asking is
 * welcome once; asking again soon after a "no" or after they already shared is
 * nagging. Manual share buttons ignore these rules.
 */

const STATE_KEY = "resume-maker:share-state";
const DAY = 24 * 60 * 60 * 1000;
const QUIET_AFTER_DISMISS = 30 * DAY;
const QUIET_AFTER_SHARE = 90 * DAY;

interface ShareState {
  dismissedAt?: number;
  sharedAt?: number;
}

/** `null` means storage can't be trusted (blocked, corrupt). */
function readState(): ShareState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as ShareState) : null;
  } catch {
    return null;
  }
}

function writeState(patch: ShareState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...(readState() ?? {}), ...patch }));
  } catch {
    // Storage blocked: the prompt stays off (readState returns null).
  }
}

export function shouldAutoPromptShare(now: number): boolean {
  const state = readState();
  // If we can't remember a "no", we'd ask on every visit — so don't ask.
  if (!state) return false;
  if (state.dismissedAt && now - state.dismissedAt < QUIET_AFTER_DISMISS) return false;
  if (state.sharedAt && now - state.sharedAt < QUIET_AFTER_SHARE) return false;
  return true;
}

export function recordShareDismissed(now: number): void {
  writeState({ dismissedAt: now });
}

export function recordShared(now: number): void {
  writeState({ sharedAt: now });
}
