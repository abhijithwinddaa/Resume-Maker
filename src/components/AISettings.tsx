import React, { useState } from "react";
import type { AISettings as AISettingsType } from "../types/aiSettings";
import { GROQ_MODELS, GITHUB_MODELS } from "../types/aiSettings";
import { useAppStore } from "../store/appStore";
import { clearAICacheStorage } from "../utils/aiCache";
import { clearLocalBackup } from "../utils/localBackup";
import {
  Settings,
  Key,
  Globe,
  Cpu,
  Github,
  X,
  Shield,
  Database,
  HardDrive,
} from "lucide-react";
import "./AISettings.css";

interface AISettingsPanelProps {
  onClose: () => void;
}

const AISettingsPanel: React.FC<AISettingsPanelProps> = ({ onClose }) => {
  const settings = useAppStore((s) => s.aiSettings);
  const setAISettings = useAppStore((s) => s.setAISettings);
  const privacySettings = useAppStore((s) => s.privacySettings);
  const setPrivacySettings = useAppStore((s) => s.setPrivacySettings);
  const setHasBackup = useAppStore((s) => s.setHasBackup);

  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);

  const updateAI = (partial: Partial<AISettingsType>) => {
    setAISettings(partial);
  };

  const updatePrivacy = async (
    key: keyof typeof privacySettings,
    value: boolean,
  ) => {
    setPrivacySettings({ [key]: value });

    if (key === "saveLocalBackups" && !value) {
      clearLocalBackup();
      setHasBackup(false);
      setStorageMessage(
        "Local backups are now disabled and the existing backup was cleared.",
      );
      return;
    }

    if (key === "cacheAIResponses" && !value) {
      setIsClearingCache(true);
      await clearAICacheStorage();
      setIsClearingCache(false);
      setStorageMessage(
        "AI caching is now disabled and cached responses were cleared.",
      );
      return;
    }

    setStorageMessage(null);
  };

  const handleClearBackup = () => {
    clearLocalBackup();
    setHasBackup(false);
    setStorageMessage("Local backup cleared.");
  };

  const handleClearAICache = async () => {
    setIsClearingCache(true);
    await clearAICacheStorage();
    setIsClearingCache(false);
    setStorageMessage("AI cache cleared.");
  };

  return (
    <div
      className="ai-settings-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div className="ai-settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="ai-settings-header">
          <h2 className="settings-title">
            <Settings size={18} />
            Settings
          </h2>
          <button
            className="ai-settings-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <section className="settings-section">
          <div className="settings-section-header">
            <Settings size={16} />
            <div>
              <h3>AI Provider</h3>
              <p>
                Choose how parsing and client-side generation run. ATS scoring
                and optimization use the secure server proxy when available.
              </p>
            </div>
          </div>

          <div className="provider-toggle">
            <label className="toggle-label">AI Provider</label>
            <div className="toggle-buttons">
              <button
                className={`toggle-btn ${settings.provider === "github" ? "active" : ""}`}
                onClick={() => updateAI({ provider: "github" })}
                aria-pressed={settings.provider === "github"}
              >
                <Github size={14} />
                GitHub Models
              </button>
              <button
                className={`toggle-btn ${settings.provider === "groq" ? "active" : ""}`}
                onClick={() => updateAI({ provider: "groq" })}
                aria-pressed={settings.provider === "groq"}
              >
                <Globe size={14} />
                Groq
              </button>
              <button
                className={`toggle-btn ${settings.provider === "ollama" ? "active" : ""}`}
                onClick={() => updateAI({ provider: "ollama" })}
                aria-pressed={settings.provider === "ollama"}
              >
                <Cpu size={14} />
                Ollama
              </button>
            </div>
          </div>

          {settings.provider === "github" && (
            <div className="provider-settings">
              <div className="provider-badge github">
                <Github size={14} />
                GitHub Models - Free with GitHub token
              </div>

              <div className="settings-field">
                <label>
                  <Key size={12} />
                  GitHub Token (PAT)
                </label>
                <input
                  type="password"
                  value={settings.githubToken}
                  onChange={(e) => updateAI({ githubToken: e.target.value })}
                  placeholder="github_pat_xxxxxxxx"
                />
                <span className="field-hint">
                  Generate at{" "}
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noreferrer"
                  >
                    github.com/settings/tokens
                  </a>
                </span>
              </div>

              <div className="settings-field">
                <label>Model</label>
                <select
                  value={settings.githubModel}
                  onChange={(e) => updateAI({ githubModel: e.target.value })}
                >
                  {GITHUB_MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {settings.provider === "groq" && (
            <div className="provider-settings">
              <div className="provider-badge groq">
                <Globe size={14} />
                Groq Cloud - Free tier: 30 req/min
              </div>

              <div className="settings-field">
                <label>
                  <Key size={12} />
                  API Key
                </label>
                <input
                  type="password"
                  value={settings.groqApiKey}
                  onChange={(e) => updateAI({ groqApiKey: e.target.value })}
                  placeholder="gsk_xxxxxxxxxxxxxxxx"
                />
                <span className="field-hint">
                  Get your free key at{" "}
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noreferrer"
                  >
                    console.groq.com/keys
                  </a>
                </span>
              </div>

              <div className="settings-field">
                <label>Model</label>
                <select
                  value={settings.groqModel}
                  onChange={(e) => updateAI({ groqModel: e.target.value })}
                >
                  {GROQ_MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {settings.provider === "ollama" && (
            <div className="provider-settings">
              <div className="provider-badge ollama">
                <Cpu size={14} />
                Ollama Local - No API key needed
              </div>

              <div className="settings-field">
                <label>Ollama URL</label>
                <input
                  type="text"
                  value={settings.ollamaUrl}
                  onChange={(e) => updateAI({ ollamaUrl: e.target.value })}
                  placeholder="http://localhost:11434"
                />
              </div>

              <div className="settings-field">
                <label>Model Name</label>
                <input
                  type="text"
                  value={settings.ollamaModel}
                  onChange={(e) => updateAI({ ollamaModel: e.target.value })}
                  placeholder="llama3.2"
                />
                <span className="field-hint">
                  Make sure model is pulled:{" "}
                  <code>ollama pull {settings.ollamaModel}</code>
                </span>
              </div>

              <div className="ollama-help">
                <strong>Quick Setup:</strong>
                <ol>
                  <li>
                    Start Ollama: <code>ollama serve</code>
                  </li>
                  <li>
                    Pull a model: <code>ollama pull llama3.2</code>
                  </li>
                  <li>That's it! Click "AI Rewrite" in the JD Analyzer tab.</li>
                </ol>
              </div>
            </div>
          )}
        </section>

        <section className="settings-section">
          <div className="settings-section-header">
            <Shield size={16} />
            <div>
              <h3>Privacy & Storage</h3>
              <p>
                Decide what stays on this device and what goes into exports.
              </p>
            </div>
          </div>

          <div className="privacy-card">
            <label className="privacy-toggle">
              <div>
                <strong>Embed resume data in exported PDFs</strong>
                <span>
                  Keeps PDF re-import lossless by writing your structured resume
                  into PDF metadata.
                </span>
              </div>
              <input
                type="checkbox"
                checked={privacySettings.embedResumeDataInPdf}
                onChange={(e) =>
                  void updatePrivacy("embedResumeDataInPdf", e.target.checked)
                }
              />
            </label>

            <label className="privacy-toggle">
              <div>
                <strong>Save local backups</strong>
                <span>
                  Stores a recovery copy in this browser so unfinished work can
                  be restored later.
                </span>
              </div>
              <input
                type="checkbox"
                checked={privacySettings.saveLocalBackups}
                onChange={(e) =>
                  void updatePrivacy("saveLocalBackups", e.target.checked)
                }
              />
            </label>

            <div className="privacy-actions">
              <button
                type="button"
                className="storage-btn"
                onClick={handleClearBackup}
              >
                <HardDrive size={14} />
                Clear Local Backup
              </button>
            </div>
          </div>

          <div className="privacy-card">
            <label className="privacy-toggle">
              <div>
                <strong>Cache AI responses locally</strong>
                <span>
                  Reuses recent parse and ATS responses on this device to reduce
                  repeat API calls.
                </span>
              </div>
              <input
                type="checkbox"
                checked={privacySettings.cacheAIResponses}
                onChange={(e) =>
                  void updatePrivacy("cacheAIResponses", e.target.checked)
                }
              />
            </label>

            <div className="privacy-actions">
              <button
                type="button"
                className="storage-btn"
                onClick={() => void handleClearAICache()}
                disabled={isClearingCache}
              >
                <Database size={14} />
                {isClearingCache ? "Clearing..." : "Clear AI Cache"}
              </button>
            </div>
          </div>

          {storageMessage && (
            <div className="storage-message">{storageMessage}</div>
          )}
        </section>
      </div>
    </div>
  );
};

export default AISettingsPanel;
