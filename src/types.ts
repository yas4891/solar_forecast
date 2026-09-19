/** The small Home Assistant surface used by the data and view-model layers. */
export interface HassLike {
  states: Record<string, HassEntity | undefined>;
  config: { time_zone: string };
  /** The language the user selected in Home Assistant, preferred over the browser language. */
  locale?: { language?: string };
  language?: string;
  callWS?<T>(message: Record<string, unknown>): Promise<T>;
  connection?: object;
}

export interface HassEntity {
  state: string;
  attributes?: Record<string, unknown>;
  last_updated?: string;
  last_changed?: string;
  last_reported?: string;
}

export interface CardConfig {
  type: string;
  name?: string;
  language?: string;
  production_today_entity?: string;
  /** Tomorrow's forecast sensor, read as it was at 19:00 two days earlier. */
  history_forecast_entity?: string;
  /** Omit this field to prefer Forecast.Solar whenever it is installed. */
  forecast_provider?: ForecastProvider;
}

export type ForecastProvider = "forecast_solar" | "solcast_solar";

export interface ForecastSource {
  entryId: string;
  /** Integration that owns this combined forecast source. */
  provider?: ForecastProvider;
  remainingEntityId?: string;
  tomorrowEntityId?: string;
  /** Active aggregate daily forecast sensors, indexed by days after today. */
  dailyEntityIds?: Partial<Record<number, string>>;
  /** Solcast's selected estimate sensor. It is absent for Forecast.Solar. */
  estimateModeEntityId?: string;
}

export interface DataIssue {
  key: string;
  /** Integration that produced this issue, when an integration is known. */
  provider?: ForecastProvider;
  code:
    | "connection_unavailable"
    | "source_discovery_failed"
    | "forecast_unavailable"
    | "forecast_schema_invalid"
    | "forecast_incomplete"
    | "invalid_energy"
    | "production_invalid"
    | "history_unavailable"
    | "history_invalid"
    | "history_schema_invalid"
    | "invalid_language"
    | "forecast_provider_invalid"
    | "forecast_provider_unavailable"
    | "solcast_ambiguous"
    | "solcast_mode_invalid";
  sourceId?: string;
  entityId?: string;
  params?: Record<string, string | number>;
  /** Schema errors indicate a permanent request mismatch and bypass the normal delay. */
  immediate?: boolean;
}

export interface SourceForecast {
  source: ForecastSource;
  /** Energy per local calendar day, in kWh. */
  dailyKwh: Map<string, number>;
  /** Number of aggregated intervals per local calendar day. */
  dailyIntervals: Map<string, number>;
  /** The remaining forecast for today, in kWh. */
  remainingKwh?: number;
  issues: DataIssue[];
  fetchedAt: number;
  stale?: boolean;
  serviceFailed?: boolean;
  /** The installed Home Assistant version does not expose get_forecast. */
  unsupportedService?: boolean;
  /** The source cannot use its service response and may use the dashboard fallback. */
  fallbackEligible?: boolean;
  schemaInvalid?: boolean;
}

export interface ForecastPayload {
  /** The provider selected for this payload, if an integration is available. */
  provider?: ForecastProvider;
  sources: ForecastSource[];
  sourceForecasts: SourceForecast[];
  issues: DataIssue[];
  fetchedAt: number;
  stale?: boolean;
}

/** A complete comparison of a past calendar day. All energy values use kWh. */
export interface HistoricalComparison {
  dateKey: string;
  actualKwh?: number;
  forecastKwh?: number;
  forecastAt: number;
  actualAt?: number;
  complete: boolean;
}

export interface HistoryPayload {
  comparisons: HistoricalComparison[];
  issues: DataIssue[];
  fetchedAt: number;
  stale?: boolean;
}

export interface DailyForecast {
  dateKey: string;
  forecastKwh?: number;
  productionKwh?: number;
  totalKwh?: number;
  complete: boolean;
  /** A day built from a truncated time series at the forecast horizon. */
  partial: boolean;
  isToday: boolean;
  sourceCount: number;
  expectedSourceCount: number;
}

export interface CardViewModel {
  /** Past comparisons are separate from the forward forecast period. */
  historyDays: HistoricalComparison[];
  days: DailyForecast[];
  remainingKwh: number | null;
  periodKwh: number | null;
  averageKwh: number | null;
  maxKwh: number | null;
  /** False when a displayed day or a source is missing from the period total. */
  periodComplete: boolean;
  issues: DataIssue[];
  updatedAt: number;
}
