import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Link2, Share2, X } from "lucide-react";
import { trackEvent } from "../utils/analytics";
import {
  buildShareTargets,
  buildShareUrl,
  shareMessage,
  type ShareChannel,
} from "../utils/shareLinks";
import { recordShareDismissed, recordShared } from "../utils/sharePrompt";
import "./ShareCard.css";

export type SharePlacement = "after-export" | "after-improvement" | "menu" | "landing";

interface ShareCardProps {
  placement: SharePlacement;
  /** The user's score jump, for a more personal message. */
  improvement?: { from: number; to: number };
  onClose: () => void;
}

const COPY_CONFIRM_MS = 2000;

const HEADINGS: Record<SharePlacement, { title: string; body: string }> = {
  "after-export": {
    title: "Your resume is ready 🎉",
    body: "Know someone who's job hunting? Send them Resume Maker. It's free.",
  },
  "after-improvement": {
    title: "Nice jump! Share it?",
    body: "Help a friend get past the ATS filter too.",
  },
  menu: {
    title: "Share Resume Maker",
    body: "Free ATS checks and honest AI edits for anyone who's job hunting.",
  },
  landing: {
    title: "Share Resume Maker",
    body: "Free ATS checks and honest AI edits for anyone who's job hunting.",
  },
};

/** Only the prompt the app opened by itself remembers a "no thanks". */
const isAutomatic = (placement: SharePlacement) => placement === "after-export";

export function ShareCard({ placement, improvement, onClose }: ShareCardProps) {
  const message = useMemo(() => shareMessage(improvement), [improvement]);
  const targets = useMemo(() => buildShareTargets(message), [message]);
  const [copied, setCopied] = useState(false);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const firstButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    trackEvent("share_prompt_shown", { placement });
    firstButtonRef.current?.focus({ preventScroll: true });
  }, [placement]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPY_CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const shared = (channel: ShareChannel | "copy" | "native") => {
    recordShared(Date.now());
    trackEvent("share_clicked", { placement, channel });
  };

  const close = () => {
    if (isAutomatic(placement)) {
      recordShareDismissed(Date.now());
      trackEvent("share_prompt_dismissed", { placement });
    }
    onClose();
  };
  // Escape works wherever focus is, not only inside the card.
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nativeShare = async () => {
    try {
      await navigator.share({
        title: "Resume Maker",
        text: message,
        url: buildShareUrl("native"),
      });
      shared("native");
    } catch {
      // The user closed the share sheet; nothing to record.
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(buildShareUrl("copy"));
      setCopied(true);
      shared("copy");
    } catch {
      // Clipboard blocked; the app buttons still work.
    }
  };

  const { title, body } = HEADINGS[placement];

  return (
    <div
      className="share-card"
      role="dialog"
      aria-labelledby="share-card-title"
    >
      <button type="button" className="share-card-close" onClick={close} aria-label="Close">
        <X size={16} />
      </button>
      <h2 id="share-card-title" className="share-card-title">
        {title}
      </h2>
      <p className="share-card-body">{body}</p>

      {canNativeShare && (
        <button
          ref={firstButtonRef}
          type="button"
          className="share-native"
          onClick={nativeShare}
        >
          <Share2 size={16} aria-hidden="true" />
          Share
        </button>
      )}

      <div className="share-targets">
        {targets.map((target) => (
          <a
            key={target.id}
            className={`share-target share-target-${target.id}`}
            href={target.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => shared(target.id)}
          >
            {target.label}
          </a>
        ))}
      </div>

      <button
        ref={canNativeShare ? undefined : firstButtonRef}
        type="button"
        className="share-copy"
        onClick={copyLink}
        aria-live="polite"
      >
        {copied ? <Check size={14} aria-hidden="true" /> : <Link2 size={14} aria-hidden="true" />}
        {copied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}

export default ShareCard;
