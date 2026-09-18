export const translationKeys = [
  "title",
  "remaining",
  "period",
  "average",
  "perDay",
  "today",
  "yesterday",
  "tomorrow",
  "produced",
  "forecast",
  "forecastAt19",
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
  "historyForecastEntity",
  "historyForecastHelp",
  "invalidLanguage",
  "warningConnection",
  "warningSources",
  "warningForecast",
  "warningIncomplete",
  "warningEnergy",
  "warningProduction",
  "warningHistory",
  "warningHistoryConfiguration",
  "warningHistorySchema",
  "warningSchema",
] as const;

export type TranslationKey = (typeof translationKeys)[number];
export type Dictionary = Record<TranslationKey, string>;

export interface LocaleDefinition {
  name: string;
  dictionary: Dictionary;
}
