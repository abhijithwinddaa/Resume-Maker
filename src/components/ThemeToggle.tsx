import React from "react";
import { useAppStore } from "../store/appStore";
import type { ThemeMode } from "../store/appStore";
import { Sun, Moon, Monitor } from "lucide-react";
import "./ThemeToggle.css";

const ThemeToggle: React.FC = () => {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const cycleTheme = () => {
    const next: ThemeMode =
      theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
  };

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <button
      className="theme-toggle"
      onClick={cycleTheme}
      aria-label={`Current theme: ${theme}. Click to switch.`}
      title={`Theme: ${theme}`}
    >
      <Icon size={16} />
    </button>
  );
};

export default ThemeToggle;
