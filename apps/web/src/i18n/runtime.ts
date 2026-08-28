export type AppLanguage = 'fr' | 'en' | 'fi';

const LANGUAGE_STORAGE_KEY = 'toquehub.language';

export function readStoredLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'fr';
  const requestedLanguage = new URLSearchParams(window.location.search).get('lang');
  if (requestedLanguage === 'en' || requestedLanguage === 'fr' || requestedLanguage === 'fi') {
    return requestedLanguage;
  }
  const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return storedLanguage === 'en' || storedLanguage === 'fi' ? storedLanguage : 'fr';
}

let currentLanguage: AppLanguage = readStoredLanguage();

export function activeLanguage(): AppLanguage {
  return currentLanguage;
}

export function activeLocale(): 'fr-FR' | 'en-GB' | 'fi-FI' {
  if (currentLanguage === 'en') return 'en-GB';
  if (currentLanguage === 'fi') return 'fi-FI';
  return 'fr-FR';
}

export function setActiveLanguage(language: AppLanguage, persist = true) {
  currentLanguage = language;
  if (persist && typeof window !== 'undefined') {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }
}
