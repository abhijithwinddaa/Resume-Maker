import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import "./LanguageSwitcher.css";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "hi", label: "हिन्दी" },
];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  return (
    <div className="lang-switcher">
      <Globe size={14} />
      <select
        value={i18n.language}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
        aria-label="Select language"
        className="lang-select"
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
}
