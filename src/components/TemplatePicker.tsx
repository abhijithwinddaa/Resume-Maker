import React from "react";
import { useAppStore } from "../store/appStore";
import { TEMPLATES, COLOR_PRESETS, FONT_OPTIONS } from "../types/templates";
import type { TemplateId } from "../types/templates";
import { Palette, Type, X, Sparkles } from "lucide-react";
import "./TemplatePicker.css";

interface TemplatePickerProps {
  onClose: () => void;
}

const TemplatePicker: React.FC<TemplatePickerProps> = ({ onClose }) => {
  const templateId = useAppStore((s) => s.templateId);
  const customization = useAppStore((s) => s.customization);
  const setTemplateId = useAppStore((s) => s.setTemplateId);
  const setCustomization = useAppStore((s) => s.setCustomization);
  const detectedStyle = useAppStore((s) => s.detectedStyle);
  const applyDetectedStyle = useAppStore((s) => s.applyDetectedStyle);

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
            {(["small", "medium", "large"] as const).map((s) => (
              <button
                key={s}
                className={`picker-toggle ${customization.fontSize === s ? "active" : ""}`}
                onClick={() => setCustomization({ fontSize: s })}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Spacing */}
        <div className="picker-section">
          <h4>Spacing</h4>
          <div className="picker-toggle-group">
            {(["compact", "normal", "relaxed"] as const).map((s) => (
              <button
                key={s}
                className={`picker-toggle ${customization.lineHeight === s ? "active" : ""}`}
                onClick={() => setCustomization({ lineHeight: s })}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplatePicker;
