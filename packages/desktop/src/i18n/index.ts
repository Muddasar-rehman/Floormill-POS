import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { translations } from "shared";

const STORAGE_KEY = "grain-erp-lang";

export function getStoredLanguage(): "en" | "ur" {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "ur" ? "ur" : "en";
}

export function setStoredLanguage(lang: "en" | "ur") {
  localStorage.setItem(STORAGE_KEY, lang);
  i18n.changeLanguage(lang);
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: translations.en },
    ur: { translation: translations.ur },
  },
  lng: getStoredLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
