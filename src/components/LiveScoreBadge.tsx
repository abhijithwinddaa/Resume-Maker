import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Activity, X } from "lucide-react";
import type { ResumeData } from "../types/resume";
import { computeLiveScore } from "../utils/liveScore";
import "./LiveScoreBadge.css";

interface LiveScoreBadgeProps {
  resume: ResumeData;
  /** Keywords from the last job-description scan; empty for no job. */
  jobKeywords: string[];
  /** Runs the full AI score. */
  onFullScore: () => void;
  fullScoreDisabled?: boolean;
}

const TWEEN_MS = 450;
const DELTA_VISIBLE_MS = 1600;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function tone(score: number): "good" | "fair" | "low" {
  return score >= 75 ? "good" : score >= 50 ? "fair" : "low";
}

/** Counts from the previous value to the new one so changes are noticeable. */
function useTweenedNumber(target: number): number {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    const from = fromRef.current;
    fromRef.current = target;
    if (from === target) return;

    if (prefersReducedMotion()) {
      const frame = requestAnimationFrame(() => setShown(target));
      return () => cancelAnimationFrame(frame);
    }

    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / TWEEN_MS);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(from + (target - from) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return shown;
}

export function LiveScoreBadge({
  resume,
  jobKeywords,
  onFullScore,
  fullScoreDisabled,
}: LiveScoreBadgeProps) {
  // Typing stays instant; the check catches up a moment later.
  const deferredResume = useDeferredValue(resume);
  const live = useMemo(
    () => computeLiveScore(deferredResume, jobKeywords),
    [deferredResume, jobKeywords],
  );
  const shown = useTweenedNumber(live.score);

  const [delta, setDelta] = useState<number | null>(null);
  const previousScoreRef = useRef(live.score);
  useEffect(() => {
    const change = live.score - previousScoreRef.current;
    previousScoreRef.current = live.score;
    if (change === 0) return;
    const show = requestAnimationFrame(() => setDelta(change));
    const hide = window.setTimeout(() => setDelta(null), DELTA_VISIBLE_MS);
    return () => {
      cancelAnimationFrame(show);
      window.clearTimeout(hide);
    };
  }, [live.score]);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const level = tone(live.score);

  return (
    <div className="live-score" ref={rootRef}>
      <button
        type="button"
        className={`live-score-badge live-score-${level}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Live check: ${live.score} out of 100. Show what to improve.`}
        title="Instant on-device check — no AI used"
        data-tour="live-score"
      >
        <Activity size={14} aria-hidden="true" />
        <span className="live-score-label">Live check</span>
        <span className="live-score-value">{shown}</span>
        {delta !== null && (
          <span
            key={`${live.score}`}
            className={`live-score-delta ${delta > 0 ? "is-up" : "is-down"}`}
            aria-hidden="true"
          >
            {delta > 0 ? `+${delta}` : delta}
          </span>
        )}
      </button>
      {/* Screen readers hear the settled number, not every tween frame. */}
      <span className="sr-only" aria-live="polite">
        Live check {live.score}
      </span>

      {open && (
        <div className="live-score-popover" role="dialog" aria-label="Live check details">
          <div className="live-score-popover-head">
            <strong>Live check · {live.score}/100</strong>
            <button
              type="button"
              className="live-score-close"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
          <p className="live-score-explain">
            Updates as you type, using quick checks on this device: completeness,
            action verbs, measurable results, and summary quality
            {live.keywordCoverage
              ? `, plus ${live.keywordCoverage.found} of ${live.keywordCoverage.total} job keywords`
              : ""}
            .
          </p>
          {live.issues.length > 0 ? (
            <>
              <p className="live-score-subhead">Improve next</p>
              <ul className="live-score-issues">
                {live.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="live-score-allgood">Nothing obvious left to fix.</p>
          )}
          <button
            type="button"
            className="live-score-full"
            onClick={() => {
              setOpen(false);
              onFullScore();
            }}
            disabled={fullScoreDisabled}
          >
            Get the full AI score
          </button>
        </div>
      )}
    </div>
  );
}

export default LiveScoreBadge;
