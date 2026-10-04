import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Upload, Sparkles, Download, X } from "lucide-react";
import {
  findTourTarget,
  markTourSeen,
  resolveTourSteps,
  type TourId,
  type TourStep,
} from "./tourSteps";
import "./GuidedTour.css";

interface GuidedTourProps {
  tourId: TourId;
  onClose: () => void;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PADDING = 8;
const CARD_GAP = 14;
const VIEWPORT_MARGIN = 12;
/** Below this width the card docks to the bottom of the screen. */
const SHEET_BREAKPOINT = 640;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function spotlightFor(el: HTMLElement): Box {
  const r = el.getBoundingClientRect();
  return {
    top: r.top - SPOTLIGHT_PADDING,
    left: r.left - SPOTLIGHT_PADDING,
    width: r.width + SPOTLIGHT_PADDING * 2,
    height: r.height + SPOTLIGHT_PADDING * 2,
  };
}

/** Below the target if it fits, else above, else over it; clamped to the viewport. */
function placeCard(spot: Box | null, card: { width: number; height: number }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!spot) {
    return { top: (vh - card.height) / 2, left: (vw - card.width) / 2 };
  }

  const below = spot.top + spot.height + CARD_GAP;
  const above = spot.top - CARD_GAP - card.height;
  const top =
    below + card.height <= vh - VIEWPORT_MARGIN
      ? below
      : above >= VIEWPORT_MARGIN
        ? above
        : Math.max(VIEWPORT_MARGIN, vh - card.height - VIEWPORT_MARGIN);

  const centered = spot.left + spot.width / 2 - card.width / 2;
  const left = Math.min(
    Math.max(VIEWPORT_MARGIN, centered),
    vw - card.width - VIEWPORT_MARGIN,
  );
  return { top, left };
}

function FlowIllustration() {
  return (
    <div className="tour-flow" aria-hidden="true">
      <div className="tour-flow-node tour-flow-node-1">
        <Upload size={18} />
        <span>Upload</span>
      </div>
      <div className="tour-flow-link" />
      <div className="tour-flow-node tour-flow-node-2">
        <Sparkles size={18} />
        <span>Improve</span>
      </div>
      <div className="tour-flow-link" />
      <div className="tour-flow-node tour-flow-node-3">
        <Download size={18} />
        <span>Download</span>
      </div>
    </div>
  );
}

export function GuidedTour({ tourId, onClose }: GuidedTourProps) {
  // Resolved once on open: which steps have something on screen to point at.
  const [steps] = useState<TourStep[]>(() => resolveTourSteps(tourId));
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<Box | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);
  const [isSheet, setIsSheet] = useState(() => window.innerWidth < SHEET_BREAKPOINT);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<Element | null>(document.activeElement);

  const step = steps[index];
  const isLast = index === steps.length - 1;

  const finish = useCallback(() => {
    markTourSeen(tourId);
    onClose();
  }, [onClose, tourId]);

  const measure = useCallback(() => {
    if (!step) return;
    const target = findTourTarget(step);
    const nextSpot = target ? spotlightFor(target) : null;
    setSpot(nextSpot);
    setIsSheet(window.innerWidth < SHEET_BREAKPOINT);

    const card = cardRef.current;
    if (card) {
      setCardPos(
        placeCard(nextSpot, { width: card.offsetWidth, height: card.offsetHeight }),
      );
    }
  }, [step]);

  // Bring the target into view, then measure once scrolling settles.
  useLayoutEffect(() => {
    if (!step) return;
    const target = findTourTarget(step);
    target?.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    // Next frame, not synchronously: the card's entry animation starts fully
    // transparent, so the one frame it spends unpositioned is never seen.
    const frame = requestAnimationFrame(measure);
    const settle = window.setTimeout(measure, 380);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [step, measure]);

  // Follow the target through scrolling, resizing and layout shifts.
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [measure]);

  useEffect(() => {
    nextButtonRef.current?.focus({ preventScroll: true });
  }, [index]);

  // Hand focus back to wherever the user was when the guide opened.
  useEffect(() => {
    const restoreTo = restoreFocusRef.current;
    return () => {
      if (restoreTo instanceof HTMLElement) restoreTo.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (isLast) finish();
        else setIndex((i) => i + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    // Capture phase so the app's own Escape handling doesn't run underneath.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [finish, isLast]);

  // Nothing on this screen to point at — close quietly but remember it.
  useEffect(() => {
    if (steps.length === 0) finish();
  }, [steps.length, finish]);

  if (!step) return null;

  const titleId = `tour-title-${step.id}`;
  const bodyId = `tour-body-${step.id}`;

  return (
    <div className="tour-root">
      {/* Swallows clicks so the page can't change under the guide. */}
      <div className={`tour-backdrop ${spot ? "" : "tour-backdrop-dim"}`} />

      {spot && (
        <div
          className="tour-spotlight"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
          }}
          aria-hidden="true"
        />
      )}

      <div
        ref={cardRef}
        key={step.id}
        className={`tour-card ${isSheet ? "tour-card-sheet" : ""} ${spot ? "" : "tour-card-centered"}`}
        style={isSheet || !cardPos ? undefined : { top: cardPos.top, left: cardPos.left }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <button
          type="button"
          className="tour-close"
          onClick={finish}
          aria-label="Close guide"
        >
          <X size={16} />
        </button>

        {step.illustration === "flow" && <FlowIllustration />}

        <p className="tour-progress">
          Step {index + 1} of {steps.length}
        </p>
        <h2 id={titleId} className="tour-title">
          {step.title}
        </h2>
        <p id={bodyId} className="tour-body">
          {step.body}
        </p>

        <div className="tour-dots" aria-hidden="true">
          {steps.map((s, i) => (
            <span
              key={s.id}
              className={`tour-dot ${i === index ? "tour-dot-active" : ""}`}
            />
          ))}
        </div>

        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={finish}>
            Skip guide
          </button>
          <div className="tour-nav">
            {index > 0 && (
              <button
                type="button"
                className="tour-btn tour-btn-secondary"
                onClick={() => setIndex((i) => i - 1)}
              >
                Back
              </button>
            )}
            <button
              ref={nextButtonRef}
              type="button"
              className="tour-btn tour-btn-primary"
              onClick={() => (isLast ? finish() : setIndex((i) => i + 1))}
            >
              {isLast ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GuidedTour;
