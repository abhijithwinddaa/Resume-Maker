import AINotice from "./AINotice";
import { ClaimNote } from "./OptimizeReview";
import { findNewClaims } from "../utils/claimCheck";
import "./BulletCoach.css";

interface EnhancePreviewProps {
  /** The bullet as it was when the user asked for the rewrite. */
  base: string;
  /** The AI's suggested rewrite. */
  text: string;
  onUse: () => void;
  onKeepMine: () => void;
}

/** The ✨ rewrite waits here for the user's choice instead of replacing the bullet. */
export default function EnhancePreview({ base, text, onUse, onKeepMine }: EnhancePreviewProps) {
  return (
    <div className="quantify-panel" role="group" aria-label="AI suggestion for this bullet">
      <p className="quantify-question">AI suggestion:</p>
      <p className="quantify-preview">{text}</p>
      <ClaimNote claims={findNewClaims(base, text)} />
      <AINotice />
      <div className="quantify-actions">
        <button type="button" className="quantify-primary" onClick={onUse}>
          Use this
        </button>
        <button type="button" className="quantify-link" onClick={onKeepMine}>
          Keep mine
        </button>
      </div>
    </div>
  );
}
