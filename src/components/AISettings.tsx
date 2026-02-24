import React from "react";
import type { AISettings } from "../types/aiSettings";
import { GROQ_MODELS, GITHUB_MODELS } from "../types/aiSettings";
import { Settings, Key, Globe, Cpu, Github } from "lucide-react";
import "./AISettings.css";

interface AISettingsProps {
  settings: AISettings;
  onChange: (settings: AISettings) => void;
}

const AISettingsPanel: React.FC<AISettingsProps> = ({ settings, onChange }) => {
  const update = (partial: Partial<AISettings>) => {
    onChange({ ...settings, ...partial });
  };

  return (
    <div className="ai-settings">
      <h2 className="settings-title">
        <Settings size={18} />
        AI Settings
      </h2>

      {/* Provider Toggle */}
      <div className="provider-toggle">
        <label className="toggle-label">AI Provider</label>
        <div className="toggle-buttons">
          <button
            className={`toggle-btn ${settings.provider === "github" ? "active" : ""}`}
            onClick={() => update({ provider: "github" })}
          >
            <Github size={14} />
            GitHub Models
          </button>
          <button
            className={`toggle-btn ${settings.provider === "groq" ? "active" : ""}`}
            onClick={() => update({ provider: "groq" })}
          >
            <Globe size={14} />
            Groq
          </button>
          <button
            className={`toggle-btn ${settings.provider === "ollama" ? "active" : ""}`}
            onClick={() => update({ provider: "ollama" })}
          >
            <Cpu size={14} />
            Ollama
          </button>
        </div>
      </div>

      {/* GitHub Models Settings */}
      {settings.provider === "github" && (
        <div className="provider-settings">
          <div className="provider-badge github">
            <Github size={14} />
            GitHub Models — Free with GitHub token
          </div>

          <div className="settings-field">
            <label>
              <Key size={12} />
              GitHub Token (PAT)
            </label>
            <input
              type="password"
              value={settings.githubToken}
              onChange={(e) => update({ githubToken: e.target.value })}
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
              onChange={(e) => update({ githubModel: e.target.value })}
            >
              {GITHUB_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Groq Settings */}
      {settings.provider === "groq" && (
        <div className="provider-settings">
          <div className="provider-badge groq">
            <Globe size={14} />
            Groq Cloud — Free tier: 30 req/min
          </div>

          <div className="settings-field">
            <label>
              <Key size={12} />
              API Key
            </label>
            <input
              type="password"
              value={settings.groqApiKey}
              onChange={(e) => update({ groqApiKey: e.target.value })}
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
              onChange={(e) => update({ groqModel: e.target.value })}
            >
              {GROQ_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Ollama Settings */}
      {settings.provider === "ollama" && (
        <div className="provider-settings">
          <div className="provider-badge ollama">
            <Cpu size={14} />
            Ollama Local — No API key needed
          </div>

          <div className="settings-field">
            <label>Ollama URL</label>
            <input
              type="text"
              value={settings.ollamaUrl}
              onChange={(e) => update({ ollamaUrl: e.target.value })}
              placeholder="http://localhost:11434"
            />
          </div>

          <div className="settings-field">
            <label>Model Name</label>
            <input
              type="text"
              value={settings.ollamaModel}
              onChange={(e) => update({ ollamaModel: e.target.value })}
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
    </div>
  );
};

export default AISettingsPanel;
