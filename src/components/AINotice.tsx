import { Info } from "lucide-react";
import "./AINotice.css";

/** Small reminder that AI output needs a human check before it goes out. */
export default function AINotice({ className = "" }: { className?: string }) {
  return (
    <p className={`ai-notice ${className}`.trim()}>
      <Info size={12} aria-hidden="true" />
      <span>AI can make mistakes. Double-check your resume before you download it.</span>
    </p>
  );
}
