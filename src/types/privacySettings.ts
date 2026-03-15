export interface PrivacySettings {
  embedResumeDataInPdf: boolean;
  saveLocalBackups: boolean;
  cacheAIResponses: boolean;
}

const PRIVACY_SETTINGS_KEY = "privacy-settings";

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  embedResumeDataInPdf: true,
  saveLocalBackups: true,
  cacheAIResponses: true,
};

export function loadPrivacySettings(): PrivacySettings {
  try {
    const saved = localStorage.getItem(PRIVACY_SETTINGS_KEY);
    if (saved) {
      return {
        ...DEFAULT_PRIVACY_SETTINGS,
        ...JSON.parse(saved),
      };
    }
  } catch {
    /* ignore */
  }

  return DEFAULT_PRIVACY_SETTINGS;
}

export function savePrivacySettings(settings: PrivacySettings): void {
  localStorage.setItem(PRIVACY_SETTINGS_KEY, JSON.stringify(settings));
}
