import React from "react";
import { useAppStore } from "../store/appStore";
import type { ThemeMode } from "../store/appStore";
import { Sun, Moon, Monitor } from "lucide-react";
import "./ThemeToggle.css";

const ThemeToggle: React.FC = () => {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  // A plain light/dark switch. "system" is only kept for people who chose
  // it before; their next click lands on an explicit choice.
  const cycleTheme = () => {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
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
