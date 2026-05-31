import React from "react";
import { Bold, Italic, Highlighter } from "lucide-react";

type FormatType = "bold" | "italic" | "highlight";

const MARKERS: Record<FormatType, [string, string]> = {
  bold: ["**", "**"],
  italic: ["*", "*"],
  highlight: ["==", "=="],
};

function applyFormatToActive(type: FormatType): void {
  const el = document.activeElement;
  if (!el || el.tagName !== "TEXTAREA") return;

  const ta = el as HTMLTextAreaElement;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const [open, close] = MARKERS[type];
  const value = ta.value;
  const selectedText = value.slice(start, end);

  let newValue: string;
  let newCursorPos: number;

  if (selectedText) {
    newValue = value.slice(0, start) + open + selectedText + close + value.slice(end);
    newCursorPos = start + open.length + selectedText.length + close.length;
  } else {
    newValue = value.slice(0, start) + open + close + value.slice(end);
    newCursorPos = start + open.length;
  }

  // Use setter to trigger React synthetic event
  const proto = HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(ta, newValue);
  ta.dispatchEvent(new Event("input", { bubbles: true }));

  requestAnimationFrame(() => {
    ta.focus();
    ta.setSelectionRange(newCursorPos, newCursorPos);
  });
}

const FormatToolbar: React.FC = () => {
  return (
    <div className="format-toolbar">
      <button
        type="button"
        className="format-toolbar-btn"
        onMouseDown={(e) => { e.preventDefault(); applyFormatToActive("bold"); }}
        title="Bold (**)"
      >
        <Bold size={13} />
      </button>
      <button
        type="button"
        className="format-toolbar-btn"
        onMouseDown={(e) => { e.preventDefault(); applyFormatToActive("italic"); }}
        title="Italic (*)"
      >
        <Italic size={13} />
      </button>
      <button
        type="button"
        className="format-toolbar-btn"
        onMouseDown={(e) => { e.preventDefault(); applyFormatToActive("highlight"); }}
        title="Highlight (==)"
      >
        <Highlighter size={13} />
      </button>
    </div>
  );
};

export { MARKERS, applyFormatToActive };
export type { FormatType };
export default FormatToolbar;
