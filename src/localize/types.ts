export const translationKeys = [
  "title",
  "remaining",
  "period",
  "average",
  "perDay",
  "today",
  "tomorrow",
  "produced",
  "forecast",
  "total",
  "productionNotConfigured",
  "productionMissing",
  "productionPercent",
  "periodRestOnly",
  "periodHelp",
  "periodIncomplete",
  "approximate",
  "sourcesPartial",
  "dayPartial",
  "noForecast",
  "incomplete",
  "warning",
  "configuration",
  "name",
  "language",
  "languageAuto",
  "productionTodayEntity",
  "productionTodayHelp",
  "invalidLanguage",
  "warningConnection",
  "warningSources",
  "warningForecast",
  "warningIncomplete",
  "warningEnergy",
  "warningProduction",
  "warningSchema",
] as const;

export type TranslationKey = (typeof translationKeys)[number];
export type Dictionary = Record<TranslationKey, string>;

export interface LocaleDefinition {
  name: string;
  dictionary: Dictionary;
}
