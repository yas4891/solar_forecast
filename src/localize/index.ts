import { de } from "./de";
import { en } from "./en";
import type { Dictionary, LocaleDefinition, TranslationKey } from "./types";

const locales: Record<string, LocaleDefinition> = {
  en: { name: "English", dictionary: en },
  de: { name: "Deutsch", dictionary: de },
};

export const supportedLocales = (): Readonly<Record<string, LocaleDefinition>> => locales;

export const resolveLocale = (
  requested?: string,
  browserLanguage = globalThis.navigator?.language || "en",
): string => {
  const candidate = (requested || browserLanguage || "en").toLowerCase();
  if (locales[candidate]) return candidate;
  const base = candidate.split("-")[0];
  return locales[base] ? base : "en";
};

export const localize = (
  key: TranslationKey,
  language?: string,
  browserLanguage?: string,
): string => {
  const locale = resolveLocale(language, browserLanguage);
  return locales[locale].dictionary[key] || en[key];
};

export type { Dictionary, TranslationKey };
