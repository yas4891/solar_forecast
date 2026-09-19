import { dateKeyAt, dateKeyOffset, localDayEnd } from "../model/dates";
import type {
  CardConfig,
  DataIssue,
  ForecastPayload,
  ForecastProvider,
  ForecastSource,
  HassLike,
  SourceForecast,
} from "../types";
import { discoverForecastSources, discoverSolcastSources, type SourceDiscovery } from "./sources";

const TTL_MS = 5 * 60 * 1000;
const AUTOMATIC_SELECTION_KEY = "selection:auto";
const cacheByConnection = new WeakMap<object, Map<string, CacheEntry>>();
interface PendingEntry {
  promise: Promise<ForecastPayload>;
  modeEntityId?: string;
  mode?: string;
}

interface CacheEntry {
  loadedAt: number;
  value?: ForecastPayload;
  pending?: PendingEntry;
  estimateModeEntityId?: string;
  estimateMode?: string;
}
export interface DailySeries {
  kwh: Map<string, number>;
  intervals: Map<string, number>;
  skippedTimestamps: number;
}
type ForecastServiceResponse = { response?: { wh_period?: Record<string, unknown> } };
type SolcastServiceResponse = { response?: { data?: unknown } };
type EnergyDashboardResponse = Record<string, { wh_hours?: Record<string, unknown> }>;

/** Loads one provider only. Existing callers may omit configuration and retain automatic selection. */
export function loadForecastData(hass: HassLike, now?: number): Promise<ForecastPayload>;
export function loadForecastData(
  hass: HassLike,
  config: CardConfig | undefined,
  now?: number,
): Promise<ForecastPayload>;
export async function loadForecastData(
  hass: HassLike,
  configOrNow: CardConfig | number | undefined = { type: "custom:solar-forecast-card" },
  suppliedNow = Date.now(),
): Promise<ForecastPayload> {
  const config: CardConfig =
    typeof configOrNow === "number"
      ? { type: "custom:solar-forecast-card" }
      : (configOrNow ?? { type: "custom:solar-forecast-card" });
  const now = typeof configOrNow === "number" ? configOrNow : suppliedNow;
  const automaticSelection = config.forecast_provider === undefined;
  if (automaticSelection) {
    const cachedSelection = automaticCacheFor(hass);
    if (cachedSelection?.value && now - cachedSelection.loadedAt < TTL_MS) {
      if (isCacheProjectionCurrent(hass, cachedSelection)) return cachedSelection.value;
    }
    if (cachedSelection?.pending && isPendingProjectionCurrent(hass, cachedSelection.pending)) {
      return cachedSelection.pending.promise;
    }
  }
  const selection = await selectProvider(hass, config);
  const solcastSource =
    selection.provider === "solcast_solar" ? selection.discovery.sources[0] : undefined;
  const currentMode = solcastSource?.estimateModeEntityId
    ? hass.states[solcastSource.estimateModeEntityId]?.state
    : undefined;
  const cache = cacheFor(hass, cacheKey(selection, currentMode, config));
  if (automaticSelection) setAutomaticCache(hass, cache);
  if (
    cache.value &&
    now - cache.loadedAt < TTL_MS &&
    (cache.estimateModeEntityId === undefined || cache.estimateMode === currentMode)
  ) {
    return cache.value;
  }
  if (cache.pending && (!cache.pending.modeEntityId || cache.pending.mode === currentMode)) {
    return cache.pending.promise;
  }
  const pendingEntry: PendingEntry = {
    promise: Promise.resolve(emptyPayload(now, { key: "forecast", code: "forecast_unavailable" })),
  };
  const pending: Promise<ForecastPayload> = loadUncached(
    hass,
    selection,
    now,
    (modeEntityId, mode) => {
      pendingEntry.modeEntityId = modeEntityId;
      pendingEntry.mode = mode;
    },
  )
    .then((value) => {
      // A delayed answer must never replace data for a newer Solcast estimate mode.
      if (
        pendingEntry.modeEntityId &&
        hass.states[pendingEntry.modeEntityId]?.state !== pendingEntry.mode
      ) {
        // The data came from an obsolete estimate mode. Clear this pending entry
        // before retrying so every caller receives a forecast for the current mode.
        if (cache.pending?.promise === pending) cache.pending = undefined;
        return loadForecastData(hass, config, now);
      }
      if (
        value.sources.length === 0 &&
        value.issues.some((issue) => issue.code === "source_discovery_failed") &&
        cache.value &&
        isCacheProjectionCurrent(hass, cache)
      ) {
        const stale = {
          ...cache.value,
          stale: true,
          issues: mergeIssues(cache.value.issues, value.issues),
        };
        cache.value = stale;
        cache.loadedAt = now;
        return stale;
      }
      const source = value.provider === "solcast_solar" ? value.sources[0] : undefined;
      const sameProjection =
        value.provider !== "solcast_solar" ||
        (cache.estimateModeEntityId === source?.estimateModeEntityId &&
          cache.estimateMode === pendingEntry.mode);
      value = mergeStaleSeries(cache.value, value, sameProjection);
      cache.value = value;
      cache.loadedAt = now;
      cache.estimateModeEntityId = source?.estimateModeEntityId;
      cache.estimateMode = pendingEntry.mode;
      return value;
    })
    .catch(() => {
      if (cache.value && isCacheProjectionCurrent(hass, cache)) {
        const stale = {
          ...cache.value,
          stale: true,
          issues: mergeIssues(cache.value.issues, [
            { key: "forecast", code: "forecast_unavailable" },
          ]),
        };
        cache.value = stale;
        cache.loadedAt = now;
        return stale;
      }
      return emptyPayload(now, { key: "forecast", code: "forecast_unavailable" });
    })
    .finally(() => {
      if (cache.pending?.promise === pending) cache.pending = undefined;
    });
  pendingEntry.promise = pending;
  cache.pending = pendingEntry;
  return pending;
}

export function clearForecastCache(hass?: HassLike): void {
  if (hass) cacheByConnection.delete(hass.connection ?? hass);
}

async function loadUncached(
  hass: HassLike,
  selection: ProviderSelection,
  now: number,
  onSolcastMode: (entityId: string | undefined, mode: string | undefined) => void,
): Promise<ForecastPayload> {
  if (!selection.provider) {
    return {
      sources: [],
      sourceForecasts: [],
      issues: selection.discovery.issues,
      fetchedAt: now,
    };
  }
  const { provider, discovery } = selection;
  const solcastSource = provider === "solcast_solar" ? discovery.sources[0] : undefined;
  const solcastMode = solcastSource?.estimateModeEntityId
    ? hass.states[solcastSource.estimateModeEntityId]?.state
    : undefined;
  if (provider === "solcast_solar") {
    onSolcastMode(solcastSource?.estimateModeEntityId, solcastMode);
  }
  const sourceForecasts =
    provider === "forecast_solar"
      ? await Promise.all(
          discovery.sources.map((source) => loadForecastSolarSource(hass, source, now)),
        )
      : await Promise.all(
          discovery.sources.map((source) => loadSolcastSource(hass, source, now, solcastMode)),
        );
  if (provider === "forecast_solar") {
    await applyEnergyDashboardFallback(hass, sourceForecasts, provider);
  } else {
    await applySolcastFallbacks(hass, sourceForecasts);
  }
  return {
    provider,
    sources: discovery.sources,
    sourceForecasts,
    issues: [...discovery.issues, ...sourceForecasts.flatMap((source) => source.issues)],
    fetchedAt: now,
  };
}

async function selectProvider(hass: HassLike, config: CardConfig): Promise<ProviderSelection> {
  const requested = config.forecast_provider as string | undefined;
  if (requested && requested !== "forecast_solar" && requested !== "solcast_solar") {
    return {
      discovery: {
        sources: [],
        issues: [{ key: "config:forecast_provider", code: "forecast_provider_invalid" }],
      },
    };
  }
  if (requested === "forecast_solar") {
    const discovery = await discoverForecastSources(hass);
    return discovery.sources.length
      ? { provider: "forecast_solar", discovery }
      : { discovery: withUnavailableProvider(discovery, "forecast_solar") };
  }
  if (requested === "solcast_solar") {
    return explicitlySelectSolcast(hass);
  }
  // Only a failed config-entry lookup leaves Forecast.Solar's priority unknown.
  const forecast = await discoverForecastSources(hass);
  if (
    forecast.issues.some(
      (issue) => issue.code === "source_discovery_failed" && issue.key === "sources",
    )
  ) {
    return { discovery: forecast };
  }
  if (forecast.sources.length) {
    return { provider: "forecast_solar", discovery: forecast };
  }
  const solcast = await discoverSolcastSources(hass);
  return solcast.sources.length
    ? { provider: "solcast_solar", discovery: solcast }
    : { discovery: solcast };
}

async function explicitlySelectSolcast(hass: HassLike): Promise<ProviderSelection> {
  const discovery = await discoverSolcastSources(hass);
  return discovery.sources.length
    ? { provider: "solcast_solar", discovery }
    : { discovery: withUnavailableProvider(discovery, "solcast_solar") };
}

async function loadForecastSolarSource(
  hass: HassLike,
  source: ForecastSource,
  now: number,
): Promise<SourceForecast> {
  const issues: DataIssue[] = [];
  try {
    if (!hass.callWS) throw new Error("No connection");
    const raw = await hass.callWS<ForecastServiceResponse>({
      type: "call_service",
      domain: "forecast_solar",
      service: "get_forecast",
      service_data: { config_entry: source.entryId, resolution: "hourly" },
      return_response: true,
    });
    const periods = isObject(raw) && isObject(raw.response) ? raw.response.wh_period : undefined;
    if (!isObject(periods)) return schemaInvalidSource(source, now, "forecast_solar");
    const series = sumHourlyPeriods(periods, hass.config.time_zone);
    addSeriesIssues(issues, source, series, "forecast_solar");
    return {
      source,
      dailyKwh: series.kwh,
      dailyIntervals: series.intervals,
      issues,
      fetchedAt: now,
    };
  } catch (error: unknown) {
    if (isSchemaError(error)) return schemaInvalidSource(source, now, "forecast_solar");
    issues.push({
      key: `forecast:${source.entryId}`,
      code: "forecast_unavailable",
      sourceId: source.entryId,
      provider: "forecast_solar",
    });
    return {
      source,
      dailyKwh: new Map(),
      dailyIntervals: new Map(),
      issues,
      fetchedAt: now,
      serviceFailed: true,
      unsupportedService: isUnsupportedService(error),
    };
  }
}

function withUnavailableProvider(
  discovery: SourceDiscovery,
  provider: ForecastProvider,
): SourceDiscovery {
  if (discovery.issues.length > 0) return discovery;
  return {
    ...discovery,
    issues: [
      {
        key: `${provider}:missing`,
        code: "forecast_provider_unavailable",
        provider,
      },
    ],
  };
}

async function loadSolcastSource(
  hass: HassLike,
  source: ForecastSource,
  now: number,
  mode: string | undefined,
): Promise<SourceForecast> {
  const field = solcastField(mode);
  if (!field) {
    return {
      source,
      dailyKwh: new Map(),
      dailyIntervals: new Map(),
      issues: [
        {
          key: "solcast_solar:estimate_mode",
          code: "solcast_mode_invalid",
          sourceId: source.entryId,
          provider: "solcast_solar",
        },
      ],
      fetchedAt: now,
      serviceFailed: true,
      fallbackEligible: true,
    };
  }
  try {
    if (!hass.callWS) throw new Error("No connection");
    const raw = await hass.callWS<SolcastServiceResponse>({
      type: "call_service",
      domain: "solcast_solar",
      service: "query_forecast_data",
      service_data: {
        start_date_time: new Date(now).toISOString(),
        end_date_time: solcastQueryEnd(now, hass.config.time_zone),
      },
      return_response: true,
    });
    const data = isObject(raw) && isObject(raw.response) ? raw.response.data : undefined;
    if (!Array.isArray(data)) return schemaInvalidSource(source, now, "solcast_solar");
    const series = sumSolcastPeriods(data, field, hass.config.time_zone);
    if (!series) return schemaInvalidSource(source, now, "solcast_solar");
    const issues: DataIssue[] = [];
    addSeriesIssues(issues, source, series, "solcast_solar");
    return {
      source,
      dailyKwh: series.kwh,
      dailyIntervals: series.intervals,
      issues,
      fetchedAt: now,
    };
  } catch (error: unknown) {
    if (isSchemaError(error)) return schemaInvalidSource(source, now, "solcast_solar");
    return {
      source,
      dailyKwh: new Map(),
      dailyIntervals: new Map(),
      issues: [
        {
          key: `solcast_solar:forecast:${source.entryId}`,
          code: "forecast_unavailable",
          sourceId: source.entryId,
          provider: "solcast_solar",
        },
      ],
      fetchedAt: now,
      serviceFailed: true,
      unsupportedService: isUnsupportedService(error),
    };
  }
}

function solcastField(
  mode: string | undefined,
): "pv_estimate" | "pv_estimate10" | "pv_estimate90" | undefined {
  if (mode === "estimate") return "pv_estimate";
  if (mode === "estimate10") return "pv_estimate10";
  if (mode === "estimate90") return "pv_estimate90";
  return undefined;
}

function solcastQueryEnd(now: number, timeZone: string): string {
  const finalDay = dateKeyOffset(dateKeyAt(now, timeZone), 7);
  const end = localDayEnd(finalDay, timeZone);
  return new Date(end ?? now).toISOString();
}

function schemaInvalidSource(
  source: ForecastSource,
  now: number,
  provider: ForecastProvider,
): SourceForecast {
  const prefix = provider === "solcast_solar" ? "solcast_solar:" : "";
  return {
    source,
    dailyKwh: new Map(),
    dailyIntervals: new Map(),
    issues: [
      {
        key: `${prefix}schema:${source.entryId}`,
        code: "forecast_schema_invalid",
        sourceId: source.entryId,
        provider,
        immediate: true,
      },
    ],
    fetchedAt: now,
    schemaInvalid: true,
  };
}

function addSeriesIssues(
  issues: DataIssue[],
  source: ForecastSource,
  series: DailySeries,
  provider: ForecastProvider,
): void {
  const prefix = provider === "solcast_solar" ? "solcast_solar:" : "";
  if ([...series.kwh.values()].some((value) => !Number.isFinite(value))) {
    issues.push({
      key: `${prefix}forecast:${source.entryId}`,
      code: "invalid_energy",
      sourceId: source.entryId,
      provider,
    });
  }
  if (series.skippedTimestamps > 0) {
    issues.push({
      key: `${prefix}series:${source.entryId}`,
      code: "forecast_incomplete",
      sourceId: source.entryId,
      provider,
    });
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSchemaError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return (
    code === "invalid_format" ||
    code === "invalid_service_data" ||
    code === "service_validation_error"
  );
}

function isUnsupportedService(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "not_found"
  );
}

async function applyEnergyDashboardFallback(
  hass: HassLike,
  forecasts: SourceForecast[],
  provider: ForecastProvider,
): Promise<void> {
  if (!hass.callWS || !forecasts.some((item) => item.unsupportedService || item.fallbackEligible)) {
    return;
  }
  let response: EnergyDashboardResponse;
  try {
    response = await hass.callWS<EnergyDashboardResponse>({ type: "energy/solar_forecast" });
  } catch {
    return;
  }
  for (const item of forecasts) {
    if (!item.unsupportedService && !item.fallbackEligible) continue;
    const periods = response[item.source.entryId]?.wh_hours;
    if (!periods) continue;
    try {
      const series = sumHourlyPeriods(periods, hass.config.time_zone);
      item.dailyKwh = series.kwh;
      item.dailyIntervals = series.intervals;
      const prefix = provider === "solcast_solar" ? "solcast_solar:" : "";
      if (series.skippedTimestamps > 0) {
        item.issues.push({
          key: `${prefix}series:${item.source.entryId}`,
          code: "forecast_incomplete",
          sourceId: item.source.entryId,
          provider,
        });
      }
      if (![...series.kwh.values()].some((value) => !Number.isFinite(value))) {
        item.serviceFailed = false;
        item.unsupportedService = false;
        item.fallbackEligible = false;
        item.issues = item.issues.filter(
          (issue) => !issue.key.endsWith(`forecast:${item.source.entryId}`),
        );
      } else if (!item.issues.some((issue) => issue.code === "invalid_energy")) {
        item.issues.push({
          key: `${prefix}forecast:${item.source.entryId}`,
          code: "invalid_energy",
          sourceId: item.source.entryId,
          provider,
        });
      }
    } catch {
      // The entry keeps its existing forecast-unavailable issue.
    }
  }
}

async function applySolcastFallbacks(hass: HassLike, forecasts: SourceForecast[]): Promise<void> {
  if (forecasts.some((item) => item.schemaInvalid)) return;
  await applyEnergyDashboardFallback(hass, forecasts, "solcast_solar");
}

/** Aggregates hourly Forecast.Solar energy values per Home Assistant local day. */
export function sumHourlyPeriods(periods: Record<string, unknown>, timeZone: string): DailySeries {
  const kwh = new Map<string, number>();
  const intervals = new Map<string, number>();
  let skippedTimestamps = 0;
  for (const [start, rawWh] of Object.entries(periods)) {
    const wh =
      typeof rawWh === "number" || (typeof rawWh === "string" && rawWh.trim() !== "")
        ? Number(rawWh)
        : Number.NaN;
    const parsed = new Date(start);
    if (Number.isNaN(parsed.getTime())) {
      skippedTimestamps += 1;
      continue;
    }
    const key = dateKeyAt(parsed, timeZone);
    intervals.set(key, (intervals.get(key) ?? 0) + 1);
    if (!Number.isFinite(wh) || wh < 0) {
      kwh.set(key, Number.NaN);
      continue;
    }
    if (!Number.isFinite(kwh.get(key) ?? 0)) continue;
    kwh.set(key, (kwh.get(key) ?? 0) + wh / 1000);
  }
  return { kwh, intervals, skippedTimestamps };
}
/** Converts Solcast's half-hourly average kW values into daily kWh totals. */
export function sumSolcastPeriods(
  rows: readonly unknown[],
  field: "pv_estimate" | "pv_estimate10" | "pv_estimate90",
  timeZone: string,
): DailySeries | undefined {
  const kwh = new Map<string, number>();
  const intervals = new Map<string, number>();
  let skippedTimestamps = 0;
  for (const row of rows) {
    if (!isObject(row) || typeof row.period_start !== "string" || !(field in row)) {
      return undefined;
    }
    const parsed = new Date(row.period_start);
    if (Number.isNaN(parsed.getTime())) {
      skippedTimestamps += 1;
      continue;
    }
    const key = dateKeyAt(parsed, timeZone);
    intervals.set(key, (intervals.get(key) ?? 0) + 1);
    const rawKw = row[field];
    const kw =
      typeof rawKw === "number" || (typeof rawKw === "string" && rawKw.trim() !== "")
        ? Number(rawKw)
        : Number.NaN;
    if (!Number.isFinite(kw) || kw < 0) {
      kwh.set(key, Number.NaN);
      continue;
    }
    if (!Number.isFinite(kwh.get(key) ?? 0)) continue;
    kwh.set(key, (kwh.get(key) ?? 0) + kw * 0.5);
  }
  return { kwh, intervals, skippedTimestamps };
}
export function seriesCoverage(intervals: Map<string, number>): number {
  return [...intervals.values()].reduce((max, count) => Math.max(max, count), 0);
}

interface ProviderSelection {
  provider?: ForecastProvider;
  discovery: SourceDiscovery;
}

function cacheKey(
  selection: ProviderSelection,
  solcastMode: string | undefined,
  config: CardConfig,
): string {
  if (selection.provider === "solcast_solar")
    return `provider:solcast_solar:mode:${solcastMode ?? "missing"}`;
  if (
    selection.provider === "forecast_solar" ||
    selection.discovery.issues.some(
      (issue) => issue.provider === "forecast_solar" && issue.key === "sources",
    )
  ) {
    return "provider:forecast_solar";
  }
  return `provider:unavailable:${config.forecast_provider ?? "auto"}`;
}

function cacheFor(hass: HassLike, key: string): CacheEntry {
  const entries = cacheEntriesFor(hass);
  let entry = entries.get(key);
  if (!entry) {
    entry = { loadedAt: 0 };
    entries.set(key, entry);
  }
  return entry;
}

function automaticCacheFor(hass: HassLike): CacheEntry | undefined {
  return cacheByConnection.get(hass.connection ?? hass)?.get(AUTOMATIC_SELECTION_KEY);
}

function setAutomaticCache(hass: HassLike, entry: CacheEntry): void {
  cacheEntriesFor(hass).set(AUTOMATIC_SELECTION_KEY, entry);
}

function cacheEntriesFor(hass: HassLike): Map<string, CacheEntry> {
  const connection = hass.connection ?? hass;
  let entries = cacheByConnection.get(connection);
  if (!entries) {
    entries = new Map();
    cacheByConnection.set(connection, entries);
  }
  return entries;
}

function isCacheProjectionCurrent(hass: HassLike, cache: CacheEntry): boolean {
  return (
    cache.estimateModeEntityId === undefined ||
    hass.states[cache.estimateModeEntityId]?.state === cache.estimateMode
  );
}

function isPendingProjectionCurrent(hass: HassLike, pending: PendingEntry): boolean {
  return (
    pending.modeEntityId === undefined || hass.states[pending.modeEntityId]?.state === pending.mode
  );
}

function emptyPayload(now: number, issue: DataIssue): ForecastPayload {
  return { sources: [], sourceForecasts: [], issues: [issue], fetchedAt: now };
}

function mergeStaleSeries(
  previous: ForecastPayload | undefined,
  next: ForecastPayload,
  sameProjection = true,
): ForecastPayload {
  if (!previous || previous.provider !== next.provider || !sameProjection) return next;
  const previousById = new Map(previous.sourceForecasts.map((item) => [item.source.entryId, item]));
  let stale = false;
  const sourceForecasts = next.sourceForecasts.map((current) => {
    if (!current.serviceFailed) return current;
    const old = previousById.get(current.source.entryId);
    if (!old?.dailyKwh.size) return current;
    stale = true;
    return {
      ...current,
      dailyKwh: new Map(old.dailyKwh),
      dailyIntervals: new Map(old.dailyIntervals),
      stale: true,
    };
  });
  return stale ? { ...next, sourceForecasts, stale: true } : next;
}

function mergeIssues(previous: readonly DataIssue[], next: readonly DataIssue[]): DataIssue[] {
  return [...new Map([...previous, ...next].map((issue) => [issue.key, issue])).values()];
}
