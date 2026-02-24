import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import es from "./locales/es.json";
import hi from "./locales/hi.json";

const savedLang = localStorage.getItem("app-language") || "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    hi: { translation: hi },
  },
  lng: savedLang,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => {
  localStorage.setItem("app-language", lng);
  document.documentElement.lang = lng;
});

export default i18n;
