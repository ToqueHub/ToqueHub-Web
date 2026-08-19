export type AppLanguage = 'fr' | 'en';

const LANGUAGE_STORAGE_KEY = 'toquehub.language';

export function readStoredLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'fr';
  const requestedLanguage = new URLSearchParams(window.location.search).get('lang');
  if (requestedLanguage === 'en' || requestedLanguage === 'fr') return requestedLanguage;
  return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'fr';
}

let currentLanguage: AppLanguage = readStoredLanguage();

export function activeLanguage(): AppLanguage {
  return currentLanguage;
}

export function activeLocale(): 'fr-FR' | 'en-GB' {
  return currentLanguage === 'en' ? 'en-GB' : 'fr-FR';
}

export function setActiveLanguage(language: AppLanguage, persist = true) {
  currentLanguage = language;
  if (persist && typeof window !== 'undefined') {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }
}
