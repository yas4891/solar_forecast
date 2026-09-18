import { dateKeyAt, dateKeyOffset, localDayEnd, resolveLocalDateTime } from "../model/dates";
import { energyKwh } from "../model/energy";
import type {
  CardConfig,
  DataIssue,
  HassEntity,
  HassLike,
  HistoricalComparison,
  HistoryPayload,
} from "../types";

const ERROR_TTL_MS = 30 * 1000;
const MAX_COMPLETED_ENTRIES = 32;
const cacheByConnection = new WeakMap<object, Map<string, CacheEntry>>();

interface CacheEntry {
  expiresAt: number;
  lastAccessed: number;
  value?: HistoryPayload;
  pending?: Promise<HistoryPayload>;
  failed?: boolean;
}

/** Home Assistant compresses historical states for WebSocket responses. */
interface HistoryState {
  s: unknown;
  a: unknown;
  /** Last updated, as Unix seconds. */
  lu: unknown;
  /** Last changed, as Unix seconds. */
  lc?: unknown;
}

/** Home Assistant documents nested and entity-keyed compressed history responses. */
type HistoryResponse = HistoryState[][] | Record<string, HistoryState[]>;

/** Loads the optional yesterday comparison without storing history in the browser. */
export async function loadHistoryData(
  hass: HassLike,
  config: CardConfig,
  now = Date.now(),
): Promise<HistoryPayload> {
  if (!config.history_forecast_entity) {
    return { comparisons: [], issues: [], fetchedAt: now };
  }
  if (!config.production_today_entity) {
    return configurationPayload(
      dateKeyOffset(dateKeyAt(now, hass.config.time_zone), -1),
      config,
      now,
    );
  }
  const today = dateKeyAt(now, hass.config.time_zone);
  const yesterday = dateKeyOffset(today, -1);
  const key = [
    config.production_today_entity,
    config.history_forecast_entity,
    hass.config.time_zone,
    yesterday,
    1,
  ].join("|");
  const cache = cacheFor(hass, key, now);
  cache.lastAccessed = now;
  if (cache.value) return cache.value;
  if (cache.pending) return cache.pending;
  cache.pending = loadUncached(hass, config, yesterday, now)
    .then((value) => {
      cache.value = value;
      cache.failed = value.issues.length > 0;
      cache.expiresAt = cache.failed
        ? now + ERROR_TTL_MS
        : nextLocalDayStart(now, hass.config.time_zone);
      return value;
    })
    .catch(() => {
      const value = unavailablePayload(yesterday, config, now);
      cache.value = value;
      cache.failed = true;
      cache.expiresAt = now + ERROR_TTL_MS;
      return value;
    })
    .finally(() => {
      cache.pending = undefined;
      const connectionCache = cacheByConnection.get(hass.connection ?? hass);
      if (connectionCache) pruneCompletedEntries(connectionCache, now);
    });
  return cache.pending;
}

export function clearHistoryCache(hass?: HassLike): void {
  if (hass) cacheByConnection.delete(hass.connection ?? hass);
}

async function loadUncached(
  hass: HassLike,
  config: CardConfig,
  yesterday: string,
  now: number,
): Promise<HistoryPayload> {
  if (!hass.callWS || !config.production_today_entity || !config.history_forecast_entity) {
    return unavailablePayload(yesterday, config, now);
  }
  const timeZone = hass.config.time_zone;
  const forecastDay = dateKeyOffset(yesterday, -1);
  const forecastCandidates = resolveLocalDateTime(forecastDay, 19, timeZone);
  const actualEnd = localDayEnd(yesterday, timeZone);
  if (forecastCandidates.length !== 1 || actualEnd === undefined) {
    return invalidPayload(yesterday, config, now);
  }
  const forecastAt = forecastCandidates[0];
  // Home Assistant excludes a change at the exact query start. Start one second earlier
  // so a state changed at 19:00 participates in the effective state at 19:00.
  const forecastStart = new Date(forecastAt - 1000).toISOString();
  const forecastEnd = new Date(forecastAt + 60 * 1000).toISOString();
  const actualStart = new Date(actualEnd - 5 * 60 * 1000 - 1).toISOString();
  try {
    const [forecastRaw, actualRaw] = await Promise.all([
      historyDuring(hass, config.history_forecast_entity, forecastStart, forecastEnd),
      historyDuring(
        hass,
        config.production_today_entity,
        actualStart,
        new Date(actualEnd).toISOString(),
      ),
    ]);
    const forecastStates = statesFor(forecastRaw, config.history_forecast_entity);
    const actualStates = statesFor(actualRaw, config.production_today_entity);
    if (!forecastStates || !actualStates) return schemaPayload(yesterday, config, now);
    const forecast = effectiveAtStart(forecastStates, forecastAt);
    const actual = lastStrictlyBefore(actualStates, actualEnd);
    const comparison: HistoricalComparison = {
      dateKey: yesterday,
      forecastAt,
      actualAt: actual?.timestamp,
      forecastKwh: forecast
        ? parseHistoricalEnergy(forecast.entity, "history:forecast", config.history_forecast_entity)
        : undefined,
      actualKwh: actual
        ? parseHistoricalEnergy(actual.entity, "history:actual", config.production_today_entity)
        : undefined,
      complete: false,
    };
    comparison.complete =
      comparison.forecastKwh !== undefined && comparison.actualKwh !== undefined;
    const issues: DataIssue[] = [];
    if (!comparison.complete) {
      issues.push(historyIssue("invalid", yesterday, config, "history_invalid"));
    }
    return { comparisons: [comparison], issues, fetchedAt: now };
  } catch {
    return unavailablePayload(yesterday, config, now);
  }
}

async function historyDuring(
  hass: HassLike,
  entityId: string,
  start: string,
  end: string,
): Promise<HistoryResponse> {
  return hass.callWS!<HistoryResponse>({
    type: "history/history_during_period",
    start_time: start,
    end_time: end,
    entity_ids: [entityId],
    include_start_time_state: true,
    significant_changes_only: false,
    minimal_response: false,
    no_attributes: false,
  });
}

function statesFor(response: HistoryResponse, entityId: string): HistoryState[] | undefined {
  const states = Array.isArray(response)
    ? response.length === 1 && Array.isArray(response[0])
      ? response[0]
      : undefined
    : isRecord(response)
      ? Array.isArray(response[entityId])
        ? response[entityId]
        : Object.keys(response).length === 0
          ? []
          : undefined
      : undefined;
  if (!states || !states.every(isHistoryState)) return undefined;
  return states;
}

function effectiveAtStart(
  states: HistoryState[],
  start: number,
): { entity: HassEntity; timestamp: number } | undefined {
  return states.reduce<{ entity: HassEntity; timestamp: number } | undefined>((latest, state) => {
    const timestamp = stateTimestamp(state);
    if (timestamp === undefined || timestamp > start) return latest;
    const entity = historyEntity(state);
    if (!entity) return latest;
    return !latest || timestamp > latest.timestamp ? { entity, timestamp } : latest;
  }, undefined);
}

function lastStrictlyBefore(
  states: HistoryState[],
  end: number,
): { entity: HassEntity; timestamp: number } | undefined {
  return states.reduce<{ entity: HassEntity; timestamp: number } | undefined>((latest, state) => {
    const timestamp = stateTimestamp(state);
    const entity = historyEntity(state);
    if (timestamp === undefined || !entity || timestamp >= end) return latest;
    return !latest || timestamp > latest.timestamp ? { entity, timestamp } : latest;
  }, undefined);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHistoryState(value: unknown): value is HistoryState {
  return (
    isRecord(value) &&
    typeof value.s === "string" &&
    isRecord(value.a) &&
    typeof value.lu === "number" &&
    Number.isFinite(value.lu)
  );
}

function stateTimestamp(state: HistoryState): number | undefined {
  const seconds = typeof state.lu === "number" ? state.lu : Number.NaN;
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}

function historyEntity(state: HistoryState): HassEntity | undefined {
  if (typeof state.s !== "string" || !isRecord(state.a)) return undefined;
  return {
    state: state.s,
    attributes: state.a,
  };
}

function parseHistoricalEnergy(
  entity: HassEntity,
  key: string,
  entityId: string,
): number | undefined {
  return energyKwh(entity, key, entityId).value;
}

function unavailablePayload(dateKey: string, config: CardConfig, now: number): HistoryPayload {
  return {
    comparisons: [],
    issues: [historyIssue("unavailable", dateKey, config, "history_unavailable")],
    fetchedAt: now,
  };
}

function configurationPayload(dateKey: string, config: CardConfig, now: number): HistoryPayload {
  return {
    comparisons: [],
    issues: [historyIssue("configuration", dateKey, config, "history_invalid")],
    fetchedAt: now,
  };
}

function schemaPayload(dateKey: string, config: CardConfig, now: number): HistoryPayload {
  return {
    comparisons: [],
    issues: [
      { ...historyIssue("schema", dateKey, config, "history_schema_invalid"), immediate: true },
    ],
    fetchedAt: now,
  };
}

function cacheFor(hass: HassLike, key: string, now: number): CacheEntry {
  const connection = hass.connection ?? hass;
  let cache = cacheByConnection.get(connection);
  if (!cache) {
    cache = new Map();
    cacheByConnection.set(connection, cache);
  }
  pruneCompletedEntries(cache, now);
  const existing = cache.get(key);
  if (existing && (!existing.value || existing.expiresAt > now)) {
    return existing;
  }
  const entry: CacheEntry = { expiresAt: 0, lastAccessed: now };
  cache.set(key, entry);
  return entry;
}

function historyIssue(
  kind: string,
  dateKey: string,
  config: CardConfig,
  code: DataIssue["code"],
): DataIssue {
  const production = config.production_today_entity ?? "missing-production";
  const forecast = config.history_forecast_entity ?? "missing-forecast";
  return {
    key: `history:${kind}:${dateKey}:${production}:${forecast}`,
    code,
    entityId: config.history_forecast_entity,
    params: { date: dateKey, production_entity: production, forecast_entity: forecast },
  };
}

function nextLocalDayStart(now: number, timeZone: string): number {
  return localDayEnd(dateKeyAt(now, timeZone), timeZone) ?? now + ERROR_TTL_MS;
}

/** Removes expired completed values and bounds each connection cache without touching requests in flight. */
function pruneCompletedEntries(cache: Map<string, CacheEntry>, now: number): void {
  for (const [key, entry] of cache) {
    if (!entry.pending && entry.value && entry.expiresAt <= now) cache.delete(key);
  }
  const completed = [...cache.entries()].filter(([, entry]) => !entry.pending && entry.value);
  completed
    .sort(([, left], [, right]) => left.lastAccessed - right.lastAccessed)
    .slice(0, Math.max(0, completed.length - MAX_COMPLETED_ENTRIES))
    .forEach(([key]) => cache.delete(key));
}

function invalidPayload(dateKey: string, config: CardConfig, now: number): HistoryPayload {
  return {
    comparisons: [],
    issues: [historyIssue("invalid", dateKey, config, "history_invalid")],
    fetchedAt: now,
  };
}
