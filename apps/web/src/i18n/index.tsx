import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  readStoredLanguage,
  setActiveLanguage,
  type AppLanguage,
} from './runtime';
import { translateText } from './translate';
const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'aria-description', 'alt'];
const IGNORED_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE']);
const IGNORED_TEXT_TAGS = new Set([...IGNORED_TAGS, 'TEXTAREA']);

type LanguageContextValue = {
  language: AppLanguage;
  locale: 'fr-FR' | 'en-GB';
  setLanguage: (language: AppLanguage) => void;
  toggleLanguage: () => void;
  t: (value: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

type TextRecord = { source: string; rendered: string };
type AttributeRecord = { source: string; rendered: string };
const textRecords = new WeakMap<Text, TextRecord>();
const attributeRecords = new WeakMap<Element, Map<string, AttributeRecord>>();

function shouldIgnore(node: Node, textContent = false): boolean {
  const parent = node instanceof Element ? node : node.parentElement;
  const ignoredTags = textContent ? IGNORED_TEXT_TAGS : IGNORED_TAGS;
  return Boolean(parent && (ignoredTags.has(parent.tagName) || parent.closest('[data-i18n-ignore]')));
}

function translateTextNode(node: Text, language: AppLanguage) {
  if (shouldIgnore(node, true) || !node.data.trim()) return;
  const current = node.data;
  let record = textRecords.get(node);
  if (!record) {
    record = { source: current, rendered: current };
    textRecords.set(node, record);
  } else if (current !== record.rendered) {
    record.source = current;
  }
  const next = translateText(record.source, language);
  record.rendered = next;
  if (current !== next) node.data = next;
}

function translateAttribute(element: Element, name: string, language: AppLanguage) {
  if (shouldIgnore(element) || !element.hasAttribute(name)) return;
  const current = element.getAttribute(name) ?? '';
  if (!current.trim()) return;
  let records = attributeRecords.get(element);
  if (!records) {
    records = new Map();
    attributeRecords.set(element, records);
  }
  let record = records.get(name);
  if (!record) {
    record = { source: current, rendered: current };
    records.set(name, record);
  } else if (current !== record.rendered) {
    record.source = current;
  }
  const next = translateText(record.source, language);
  record.rendered = next;
  if (current !== next) element.setAttribute(name, next);
}

function translateElement(element: Element, language: AppLanguage) {
  for (const name of TRANSLATABLE_ATTRIBUTES) translateAttribute(element, name, language);
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) translateTextNode(child as Text, language);
    else if (child.nodeType === Node.ELEMENT_NODE) translateElement(child as Element, language);
  }
}

function installDialogTranslations(language: AppLanguage) {
  const originalAlert = window.alert;
  const originalConfirm = window.confirm;
  const originalPrompt = window.prompt;
  window.alert = (message) => originalAlert.call(window, translateText(String(message ?? ''), language));
  window.confirm = (message) => originalConfirm.call(window, translateText(String(message ?? ''), language));
  window.prompt = (message, defaultValue) =>
    originalPrompt.call(window, translateText(String(message ?? ''), language), defaultValue);
  return () => {
    window.alert = originalAlert;
    window.confirm = originalConfirm;
    window.prompt = originalPrompt;
  };
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(() => readStoredLanguage());

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    setActiveLanguage(nextLanguage);
    setLanguageState(nextLanguage);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'fr' ? 'en' : 'fr');
  }, [language, setLanguage]);

  useLayoutEffect(() => {
    setActiveLanguage(language, false);
    document.documentElement.lang = language;
    document.documentElement.dataset.language = language;
    translateElement(document.documentElement, language);
    document.title = translateText('ToqueHub — Gestion professionnelle de cuisine', language);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          translateTextNode(mutation.target as Text, language);
          continue;
        }
        if (mutation.type === 'attributes') {
          translateAttribute(mutation.target as Element, mutation.attributeName ?? '', language);
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text, language);
          else if (node.nodeType === Node.ELEMENT_NODE) translateElement(node as Element, language);
        }
      }
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRIBUTES,
    });
    const removeDialogTranslations = installDialogTranslations(language);
    return () => {
      observer.disconnect();
      removeDialogTranslations();
    };
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      locale: language === 'en' ? 'en-GB' : 'fr-FR',
      setLanguage,
      toggleLanguage,
      t: (source) => translateText(source, language),
    }),
    [language, setLanguage, toggleLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
}
