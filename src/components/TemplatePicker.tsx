import React from "react";
import { useAppStore } from "../store/appStore";
import { TEMPLATES, COLOR_PRESETS, FONT_OPTIONS } from "../types/templates";
import type { TemplateId } from "../types/templates";
import { Palette, Type, X, Sparkles } from "lucide-react";
import "./TemplatePicker.css";

interface TemplatePickerProps {
  onClose: () => void;
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function estimateRenderedPages(element: HTMLElement): number {
  const widthPx = element.getBoundingClientRect().width || element.offsetWidth;
  if (!widthPx) return 1;

  const onePagePx = (297 * widthPx) / 210;
  const contentHeightPx = Math.max(
    element.scrollHeight,
    element.getBoundingClientRect().height,
  );
  const tolerancePx = Math.max(2, Math.round(onePagePx * 0.004));

  return Math.max(1, Math.ceil((contentHeightPx - tolerancePx) / onePagePx));
}

const AUTO_FIT_CONFIGS = [
  { fontSize: "xsmall", lineHeight: "compact", sectionSpacing: "tight" },
  { fontSize: "small", lineHeight: "compact", sectionSpacing: "tight" },
  { fontSize: "small", lineHeight: "normal", sectionSpacing: "tight" },
  { fontSize: "small", lineHeight: "normal", sectionSpacing: "normal" },
  { fontSize: "medium", lineHeight: "normal", sectionSpacing: "normal" },
  { fontSize: "medium", lineHeight: "relaxed", sectionSpacing: "normal" },
  { fontSize: "medium", lineHeight: "relaxed", sectionSpacing: "spacious" },
  { fontSize: "large", lineHeight: "relaxed", sectionSpacing: "spacious" },
  { fontSize: "large", lineHeight: "relaxed", sectionSpacing: "extra-spacious" },
  { fontSize: "xlarge", lineHeight: "loose", sectionSpacing: "extra-spacious" },
] as const;

const TemplatePicker: React.FC<TemplatePickerProps> = ({ onClose }) => {
  const templateId = useAppStore((s) => s.templateId);
  const customization = useAppStore((s) => s.customization);
  const setTemplateId = useAppStore((s) => s.setTemplateId);
  const setCustomization = useAppStore((s) => s.setCustomization);
  const detectedStyle = useAppStore((s) => s.detectedStyle);
  const applyDetectedStyle = useAppStore((s) => s.applyDetectedStyle);

  const [isFitting, setIsFitting] = React.useState(false);

  const handleAutoFit = async () => {
    const element = document.querySelector(".resume-page") as HTMLElement;
    if (!element) return;

    setIsFitting(true);
    
    let bestConfig: typeof AUTO_FIT_CONFIGS[number] = AUTO_FIT_CONFIGS[0];
    let foundSpill = false;

    for (let i = 0; i < AUTO_FIT_CONFIGS.length; i++) {
      const config = AUTO_FIT_CONFIGS[i];
      setCustomization(config);
      await waitForNextPaint();

      const pages = estimateRenderedPages(element);
      if (pages > 1) {
        if (i > 0) {
          bestConfig = AUTO_FIT_CONFIGS[i - 1];
        } else {
          bestConfig = AUTO_FIT_CONFIGS[0];
        }
        foundSpill = true;
        break;
      }
    }

    if (!foundSpill) {
      bestConfig = AUTO_FIT_CONFIGS[AUTO_FIT_CONFIGS.length - 1];
    }

    setCustomization(bestConfig);
    setIsFitting(false);
  };

  return (
    <div
      className="picker-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Template Picker"
    >
      <div className="picker-panel" onClick={(e) => e.stopPropagation()}>
        <div className="picker-header">
          <h3>
            <Palette size={18} /> Template & Style
          </h3>
          <button className="picker-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Template Selection */}
        <div className="picker-section">
          <h4>Template</h4>
          <div className="template-grid">
            {/* Uploaded Style — shown when AI detected the original style */}
            {detectedStyle && detectedStyle.confidence > 0 && (
              <button
                className={`template-card template-card-detected ${
                  templateId === detectedStyle.templateId &&
                  customization.primaryColor ===
                    detectedStyle.customization.primaryColor
                    ? "selected"
                    : ""
                }`}
                onClick={applyDetectedStyle}
                aria-pressed={
                  templateId === detectedStyle.templateId &&
                  customization.primaryColor ===
                    detectedStyle.customization.primaryColor
                }
              >
                <span className="template-thumb">
                  <Sparkles size={20} />
                </span>
                <span className="template-name">Uploaded Style</span>
                <span className="template-desc">
                  {detectedStyle.styleName} ({detectedStyle.confidence}% match)
                </span>
              </button>
            )}
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                className={`template-card ${templateId === t.id ? "selected" : ""}`}
                onClick={() => setTemplateId(t.id as TemplateId)}
                aria-pressed={templateId === t.id}
              >
                <span className="template-thumb">{t.thumbnail}</span>
                <span className="template-name">{t.name}</span>
                <span className="template-desc">{t.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Color Presets */}
        <div className="picker-section">
          <h4>Color Theme</h4>
          <div className="color-presets">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c.name}
                className={`color-swatch ${customization.primaryColor === c.primary ? "selected" : ""}`}
                style={{ background: c.primary }}
                onClick={() =>
                  setCustomization({
                    primaryColor: c.primary,
                    secondaryColor: c.secondary,
                  })
                }
                aria-label={c.name}
                title={c.name}
              />
            ))}
            <label className="color-custom" title="Custom color">
              <input
                type="color"
                value={customization.primaryColor}
                onChange={(e) =>
                  setCustomization({ primaryColor: e.target.value })
                }
              />
              <span>Custom</span>
            </label>
          </div>
        </div>

        {/* Font */}
        <div className="picker-section">
          <h4>
            <Type size={14} /> Font
          </h4>
          <select
            className="picker-select"
            value={customization.fontFamily}
            onChange={(e) => setCustomization({ fontFamily: e.target.value })}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        {/* Font Size */}
        <div className="picker-section">
          <h4>Font Size</h4>
          <div className="picker-toggle-group">
            {[
              { id: "xsmall", label: "XS" },
              { id: "small", label: "S" },
              { id: "medium", label: "M" },
              { id: "large", label: "L" },
              { id: "xlarge", label: "XL" },
            ].map((s) => (
              <button
                key={s.id}
                className={`picker-toggle ${customization.fontSize === s.id ? "active" : ""}`}
                onClick={() => setCustomization({ fontSize: s.id as any })}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Line Spacing */}
        <div className="picker-section">
          <h4>Line Spacing</h4>
          <div className="picker-toggle-group">
            {[
              { id: "compact", label: "Compact" },
              { id: "normal", label: "Normal" },
              { id: "relaxed", label: "Relaxed" },
              { id: "loose", label: "Loose" },
            ].map((s) => (
              <button
                key={s.id}
                className={`picker-toggle ${customization.lineHeight === s.id ? "active" : ""}`}
                onClick={() => setCustomization({ lineHeight: s.id as any })}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Section Spacing */}
        <div className="picker-section">
          <h4>Section Spacing</h4>
          <div className="picker-toggle-group">
            {[
              { id: "tight", label: "Tight" },
              { id: "normal", label: "Normal" },
              { id: "spacious", label: "Spacious" },
              { id: "extra-spacious", label: "Extra" },
            ].map((s) => (
              <button
                key={s.id}
                className={`picker-toggle ${customization.sectionSpacing === s.id ? "active" : ""}`}
                onClick={() => setCustomization({ sectionSpacing: s.id as any })}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Auto-Fit Button */}
        <div className="picker-section" style={{ marginTop: "25px" }}>
          <button
            className="btn-autofit"
            onClick={handleAutoFit}
            disabled={isFitting}
          >
            {isFitting ? "Balancing Spacing..." : "✨ Auto-Fit to Page"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TemplatePicker;
