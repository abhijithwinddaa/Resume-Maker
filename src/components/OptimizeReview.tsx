import { useMemo, useState } from "react";
import { Check, X, Sparkles } from "lucide-react";
import type { ResumeChange } from "../utils/resumeDiff";
import { diffWords, type DiffSegment } from "../utils/wordDiff";
import { findNewClaims } from "../utils/claimCheck";
import AINotice from "./AINotice";
import "./OptimizeReview.css";

interface OptimizeReviewProps {
  changes: ResumeChange[];
  /** Called with the ids the user chose to keep. */
  onApply: (accepted: Set<string>) => void;
  /** Keep the resume exactly as it was. */
  onDiscard: () => void;
}

const KIND_LABEL: Record<ResumeChange["kind"], string> = {
  modified: "Rewritten",
  added: "Added",
  removed: "Removed",
};

function Segments({ segments, tone }: { segments: DiffSegment[]; tone: "del" | "ins" }) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.changed ? (
          <mark key={i} className={`review-${tone}`}>
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

const MAX_CLAIMS = 3;

/** Warns about claims the AI added that the user's own text never made. */
export function ClaimNote({ claims }: { claims: string[] }) {
  if (claims.length === 0) return null;
  const shown = claims.slice(0, MAX_CLAIMS).map((c) => `“${c}”`).join(", ");
  return (
    <p className="review-claim-note" role="note">
      <span aria-hidden="true">{"⚠"} </span>
      New claim{claims.length === 1 ? "" : "s"}: {shown}. Keep it only if it&apos;s true.
    </p>
  );
}

function ChangeCard({
  change,
  kept,
  onKeep,
  onDiscard,
}: {
  change: ResumeChange;
  kept: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  const diff = useMemo(() => diffWords(change.before, change.after), [change]);
  const claims = useMemo(
    () => (change.kind === "removed" ? [] : findNewClaims(change.before, change.after)),
    [change],
  );

  return (
    <li className={`review-card ${kept ? "is-kept" : "is-discarded"}`}>
      <div className="review-card-head">
        <span className="review-location">{change.location}</span>
        <span className={`review-kind review-kind-${change.kind}`}>
          {KIND_LABEL[change.kind]}
        </span>
      </div>

      {change.kind !== "added" && (
        <p className="review-text review-before">
          <span className="review-text-label">Before</span>
          <Segments segments={diff.before} tone="del" />
        </p>
      )}
      {change.kind !== "removed" && (
        <p className="review-text review-after">
          <span className="review-text-label">After</span>
          <Segments segments={diff.after} tone="ins" />
        </p>
      )}
      <ClaimNote claims={claims} />

      <div className="review-choice" role="group" aria-label={`Change in ${change.location}`}>
        <button
          type="button"
          className="review-choice-btn review-keep"
          aria-pressed={kept}
          onClick={onKeep}
        >
          <Check size={14} aria-hidden="true" /> Keep
        </button>
        <button
          type="button"
          className="review-choice-btn review-discard"
          aria-pressed={!kept}
          onClick={onDiscard}
        >
          <X size={14} aria-hidden="true" /> Discard
        </button>
      </div>
    </li>
  );
}

/**
 * The AI's rewrite, change by change. Nothing reaches the resume until the
 * user applies their selection; discarded changes keep their own wording.
 */
export function OptimizeReview({ changes, onApply, onDiscard }: OptimizeReviewProps) {
  const [kept, setKept] = useState<Set<string>>(() => new Set(changes.map((c) => c.id)));

  const setOne = (id: string, keep: boolean) =>
    setKept((prev) => {
      const next = new Set(prev);
      if (keep) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <section className="optimize-review" aria-labelledby="optimize-review-title">
      <header className="optimize-review-head">
        <h3 id="optimize-review-title">
          <Sparkles size={18} aria-hidden="true" /> Review AI changes
        </h3>
        <p>
          The AI suggested {changes.length} change{changes.length === 1 ? "" : "s"}.
          Nothing is saved until you apply. Discarded changes keep your original
          wording.
        </p>
        <div className="optimize-review-bulk">
          <button
            type="button"
            className="review-bulk-btn"
            onClick={() => setKept(new Set(changes.map((c) => c.id)))}
          >
            Keep all
          </button>
          <button type="button" className="review-bulk-btn" onClick={() => setKept(new Set())}>
            Discard all
          </button>
        </div>
      </header>

      <ul className="optimize-review-list">
        {changes.map((change) => (
          <ChangeCard
            key={change.id}
            change={change}
            kept={kept.has(change.id)}
            onKeep={() => setOne(change.id, true)}
            onDiscard={() => setOne(change.id, false)}
          />
        ))}
      </ul>

      <AINotice className="optimize-review-notice" />

      <footer className="optimize-review-actions">
        <button type="button" className="review-secondary" onClick={onDiscard}>
          Keep my original
        </button>
        <button
          type="button"
          className="review-primary"
          onClick={() => onApply(new Set(kept))}
          disabled={kept.size === 0}
        >
          Apply {kept.size} of {changes.length} change{changes.length === 1 ? "" : "s"}
        </button>
      </footer>
    </section>
  );
}

export default OptimizeReview;
