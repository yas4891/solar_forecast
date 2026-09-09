import { dateKeyAt } from "../model/dates";
import type {
  DataIssue,
  ForecastPayload,
  ForecastSource,
  HassLike,
  SourceForecast,
} from "../types";
import { discoverForecastSources } from "./sources";

const TTL_MS = 5 * 60 * 1000;
const cacheByConnection = new WeakMap<object, CacheEntry>();

interface CacheEntry {
  loadedAt: number;
  value?: ForecastPayload;
  pending?: Promise<ForecastPayload>;
}

export interface DailySeries {
  /** Energy per local calendar day, in kWh. */
  kwh: Map<string, number>;
  /** Number of aggregated intervals per local calendar day. */
  intervals: Map<string, number>;
  /** Intervals dropped because their timestamp could not be parsed. */
  skippedTimestamps: number;
}

type ForecastServiceResponse = {
  response?: { wh_period?: Record<string, unknown> };
};

export async function loadForecastData(hass: HassLike, now = Date.now()): Promise<ForecastPayload> {
  const cache = cacheFor(hass);
  if (cache.value && now - cache.loadedAt < TTL_MS) return cache.value;
  if (cache.pending) return cache.pending;

  const pending = loadUncached(hass, now)
    .then((value) => {
      if (
        value.sources.length === 0 &&
        value.issues.some((issue) => issue.code === "source_discovery_failed") &&
        cache.value
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
      value = mergeStaleSeries(cache.value, value);
      cache.value = value;
      cache.loadedAt = now;
      return value;
    })
    .catch(() => {
      if (cache.value) {
        const issue: DataIssue = { key: "forecast", code: "forecast_unavailable" };
        const stale = {
          ...cache.value,
          stale: true,
          issues: mergeIssues(cache.value.issues, [issue]),
        };
        cache.value = stale;
        cache.loadedAt = now;
        return stale;
      }
      return emptyPayload(now, { key: "forecast", code: "forecast_unavailable" });
    })
    .finally(() => {
      cache.pending = undefined;
    });
  cache.pending = pending;
  return pending;
}

export function clearForecastCache(hass?: HassLike): void {
  if (hass) cacheByConnection.delete(hass.connection ?? hass);
}

async function loadUncached(hass: HassLike, now: number): Promise<ForecastPayload> {
  const discovered = await discoverForecastSources(hass);
  if (discovered.sources.length === 0) {
    return { sources: [], sourceForecasts: [], issues: discovered.issues, fetchedAt: now };
  }
  const sourceForecasts = await Promise.all(
    discovered.sources.map((source) => loadSource(hass, source, now)),
  );
  await applyEnergyDashboardFallback(hass, sourceForecasts);
  return {
    sources: discovered.sources,
    sourceForecasts,
    issues: [...discovered.issues, ...sourceForecasts.flatMap((source) => source.issues)],
    fetchedAt: now,
  };
}

async function loadSource(
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
    const periods =
      isPeriodObject(raw) && isPeriodObject(raw.response) ? raw.response.wh_period : undefined;
    if (!isPeriodObject(periods)) {
      return schemaInvalidSource(source, now);
    }
    const series = sumHourlyPeriods(periods, hass.config.time_zone);
    if ([...series.kwh.values()].some((value) => !Number.isFinite(value))) {
      issues.push({
        key: `forecast:${source.entryId}`,
        code: "invalid_energy",
        sourceId: source.entryId,
      });
    }
    if (series.skippedTimestamps > 0) {
      issues.push({
        key: `series:${source.entryId}`,
        code: "forecast_incomplete",
        sourceId: source.entryId,
      });
    }
    return {
      source,
      dailyKwh: series.kwh,
      dailyIntervals: series.intervals,
      issues,
      fetchedAt: now,
    };
  } catch (error: unknown) {
    if (isSchemaError(error)) return schemaInvalidSource(source, now);
    issues.push({
      key: `forecast:${source.entryId}`,
      code: "forecast_unavailable",
      sourceId: source.entryId,
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

function schemaInvalidSource(source: ForecastSource, now: number): SourceForecast {
  return {
    source,
    dailyKwh: new Map(),
    dailyIntervals: new Map(),
    issues: [
      {
        key: `schema:${source.entryId}`,
        code: "forecast_schema_invalid",
        sourceId: source.entryId,
        immediate: true,
      },
    ],
    fetchedAt: now,
    schemaInvalid: true,
  };
}

function isPeriodObject(value: unknown): value is Record<string, unknown> {
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

/** Compatibility fallback for Home Assistant versions without Forecast.Solar get_forecast.
 * It only accepts energy-dashboard values for already discovered active entry IDs. */
async function applyEnergyDashboardFallback(
  hass: HassLike,
  forecasts: SourceForecast[],
): Promise<void> {
  if (!hass.callWS || !forecasts.some((item) => item.unsupportedService)) return;
  let response: Record<string, { wh_hours?: Record<string, unknown> }>;
  try {
    response = await hass.callWS<Record<string, { wh_hours?: Record<string, unknown> }>>({
      type: "energy/solar_forecast",
    });
  } catch {
    // Sensor fallback remains available and incomplete sources stay expected in the model.
    return;
  }
  for (const item of forecasts) {
    if (!item.unsupportedService) continue;
    const periods = response[item.source.entryId]?.wh_hours;
    if (!periods) continue;
    // One unusable entry never aborts the fallback for the remaining entries.
    try {
      const series = sumHourlyPeriods(periods, hass.config.time_zone);
      item.dailyKwh = series.kwh;
      item.dailyIntervals = series.intervals;
      if (series.skippedTimestamps > 0) {
        item.issues.push({
          key: `series:${item.source.entryId}`,
          code: "forecast_incomplete",
          sourceId: item.source.entryId,
        });
      }
      const invalid = [...series.kwh.values()].some((value) => !Number.isFinite(value));
      if (!invalid) {
        item.serviceFailed = false;
        item.unsupportedService = false;
        item.issues = item.issues.filter(
          (issue) => issue.key !== `forecast:${item.source.entryId}`,
        );
      } else if (!item.issues.some((issue) => issue.code === "invalid_energy")) {
        item.issues.push({
          key: `forecast:${item.source.entryId}`,
          code: "invalid_energy",
          sourceId: item.source.entryId,
        });
      }
    } catch {
      // The entry keeps its existing forecast_unavailable issue.
    }
  }
}

/**
 * Aggregates interval energy per local day and counts the intervals behind each day.
 * A single malformed timestamp never discards the whole series. It is reported instead.
 */
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

/**
 * The highest interval count of a series. A day covered by far fewer intervals is a
 * truncated day at the forecast horizon, not a genuinely low forecast.
 */
export function seriesCoverage(intervals: Map<string, number>): number {
  return [...intervals.values()].reduce((max, count) => Math.max(max, count), 0);
}

function cacheFor(hass: HassLike): CacheEntry {
  const cacheKey = hass.connection ?? hass;
  let entry = cacheByConnection.get(cacheKey);
  if (!entry) {
    entry = { loadedAt: 0 };
    cacheByConnection.set(cacheKey, entry);
  }
  return entry;
}

function emptyPayload(now: number, issue: DataIssue): ForecastPayload {
  return { sources: [], sourceForecasts: [], issues: [issue], fetchedAt: now };
}

function mergeStaleSeries(
  previous: ForecastPayload | undefined,
  next: ForecastPayload,
): ForecastPayload {
  if (!previous) return next;
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
