import type { Dictionary } from "./types";

export const de: Dictionary = {
  title: "Solarprognose",
  remaining: "REST",
  period: "ZEITRAUM",
  average: "Ø",
  perDay: "/Tag",
  today: "Heute",
  tomorrow: "Morgen",
  produced: "Erzeugt",
  forecast: "Prognose",
  total: "Gesamt",
  productionNotConfigured:
    "Es wird nur die Restprognose angezeigt, weil kein Erzeugungssensor eingerichtet ist.",
  productionMissing: "Der eingerichtete Erzeugungssensor hat keinen gültigen Energiewert.",
  productionPercent: "Erzeugt: {percent}%",
  periodRestOnly:
    "Heute enthält nur die Restprognose, weil kein Erzeugungssensor eingerichtet ist.",
  periodHelp:
    "Der Zeitraum summiert die angezeigten Tage. Der Durchschnitt verwendet nur vollständige Tage.",
  periodIncomplete:
    "Die Summe ist gekennzeichnet, weil nicht jeder angezeigte Tag vollständig vorliegt.",
  approximate: "≈",
  sourcesPartial: "{count} von {total} Quellen liefern Daten.",
  dayPartial: "Die Prognosezeitreihe dieses Tages ist unvollständig.",
  noForecast: "Keine vollständige Solarprognose verfügbar.",
  incomplete: "Prognosedaten sind unvollständig.",
  warning: "Prognosewarnung",
  configuration: "Konfiguration",
  name: "Titel",
  language: "Sprache",
  languageAuto: "Automatisch (Home Assistant)",
  productionTodayEntity: "Heutiger Erzeugungssensor",
  productionTodayHelp: "Optionaler Energiesensor für die gesamte heutige Erzeugung.",
  invalidLanguage: "Die gewählte Sprache ist nicht verfügbar. Englisch wird verwendet.",
  warningConnection: "Home Assistant ist nicht verbunden.",
  warningSources: "Forecast.Solar-Quellen können nicht erkannt werden.",
  warningForecast: "Eine Forecast.Solar-Prognose ist nicht verfügbar.",
  warningIncomplete: "Prognosedaten sind unvollständig.",
  warningEnergy: "Ein Prognoseenergiewert ist ungültig.",
  warningProduction: "Der eingerichtete Erzeugungssensor ist ungültig.",
  warningSchema:
    "Die Prognoseantwort ist nicht kompatibel. Prüfe die Kartenkompatibilität mit Home Assistant.",
};
