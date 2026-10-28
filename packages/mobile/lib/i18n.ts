import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { translations, type AppLanguage } from "shared";

const STORAGE_KEY = "grain-erp-lang";

export async function getStoredLanguage(): Promise<AppLanguage> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  return stored === "ur" ? "ur" : "en";
}

export async function setStoredLanguage(lang: AppLanguage) {
  await AsyncStorage.setItem(STORAGE_KEY, lang);
  await i18n.changeLanguage(lang);
}

export async function initI18n() {
  const lng = await getStoredLanguage();
  await i18n.use(initReactI18next).init({
    resources: {
      en: { translation: translations.en },
      ur: { translation: translations.ur },
    },
    lng,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    // This Hermes build has no Intl.PluralRules; opting into v3 plural
    // handling up front avoids i18next's noisy fallback warning at init.
    compatibilityJSON: "v3",
  });
  return i18n;
}

export default i18n;
