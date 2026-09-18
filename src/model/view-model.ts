import { dateKeysFrom } from "./dates";
import { energyKwh, isCurrentLocalDay } from "./energy";
import { seriesCoverage } from "../data/forecast";
import type {
  CardConfig,
  CardViewModel,
  DailyForecast,
  ForecastPayload,
  HassLike,
  HistoryPayload,
} from "../types";

/**
 * Share of a series' best-covered day that a day must reach to count as a full day.
 * Daylight length changes slowly, so a much shorter day is a truncated horizon day.
 */
const COVERAGE_RATIO = 0.6;

/** Creates display data without mutating Home Assistant state or the cached payload. */
export function buildViewModel(
  hass: HassLike,
  config: CardConfig,
  payload: ForecastPayload,
  now: number | Date = Date.now(),
  historyPayload: HistoryPayload = { comparisons: [], issues: [], fetchedAt: 0 },
): CardViewModel {
  const issues = [...payload.issues, ...historyPayload.issues];
  const keys = dateKeysFrom(now, hass.config.time_zone, 5);
  const [today, ...futureKeys] = keys;
  const productionEntity = config.production_today_entity
    ? hass.states[config.production_today_entity]
    : undefined;
  const production = config.production_today_entity
    ? energyKwh(productionEntity, "production", config.production_today_entity)
    : {};
  if (
    production.value !== undefined &&
    !isCurrentLocalDay(productionEntity, today, hass.config.time_zone)
  ) {
    production.value = undefined;
    production.issue = {
      key: "production",
      code: "production_invalid",
      entityId: config.production_today_entity,
    };
  }
  if (production.issue) {
    issues.push({ ...production.issue, code: "production_invalid" });
  }

  const days: DailyForecast[] = [];
  const todayParsed = payload.sources.map((source) => {
    if (!source.remainingEntityId) {
      return {
        issue: {
          key: `remaining:${source.entryId}`,
          code: "forecast_incomplete" as const,
          sourceId: source.entryId,
        },
      };
    }
    const entity = hass.states[source.remainingEntityId];
    const parsed = energyKwh(entity, `remaining:${source.entryId}`, source.remainingEntityId);
    if (parsed.value !== undefined && !isCurrentLocalDay(entity, today, hass.config.time_zone)) {
      return {
        issue: {
          key: `remaining:${source.entryId}`,
          code: "forecast_incomplete" as const,
          sourceId: source.entryId,
        },
      };
    }
    return parsed;
  });
  for (const parsed of todayParsed) {
    if (parsed.issue) issues.push({ ...parsed.issue, sourceId: parsed.issue.sourceId });
  }
  const todayValues = todayParsed.map((item) => item.value);
  const todayComplete =
    payload.sources.length > 0 && todayValues.every((value) => value !== undefined);
  const validToday = todayValues.filter((value): value is number => value !== undefined);
  // Keep a partial today out of all totals. It remains visible to explain why data is unavailable.
  const todayForecast = todayComplete
    ? validToday.reduce((sum, value) => sum + value, 0)
    : undefined;
  const todayTotal =
    todayForecast === undefined ? undefined : todayForecast + (production.value ?? 0);
  if (payload.sources.length > 0) {
    days.push({
      dateKey: today,
      forecastKwh: todayForecast,
      productionKwh: production.value,
      totalKwh: todayTotal,
      complete: todayComplete,
      partial: false,
      isToday: true,
      sourceCount: validToday.length,
      expectedSourceCount: payload.sources.length,
    });
  }

  const coverageByEntry = new Map(
    payload.sourceForecasts.map((item) => [
      item.source.entryId,
      seriesCoverage(item.dailyIntervals),
    ]),
  );

  for (const key of futureKeys) {
    let truncated = false;
    const values = payload.sources.map((source) => {
      const forecast = payload.sourceForecasts.find(
        (item) => item.source.entryId === source.entryId,
      );
      const cached = forecast?.dailyKwh.get(key);
      // The tomorrow sensor is a live fallback while the five-minute time-series cache refreshes.
      if (cached === undefined && key === futureKeys[0] && source.tomorrowEntityId) {
        const entity = hass.states[source.tomorrowEntityId];
        const parsed = energyKwh(entity, `tomorrow:${source.entryId}`, source.tomorrowEntityId);
        if (parsed.issue) issues.push({ ...parsed.issue, sourceId: source.entryId });
        return parsed.value !== undefined && isCurrentLocalDay(entity, today, hass.config.time_zone)
          ? parsed.value
          : undefined;
      }
      // A day covered by far fewer intervals than the series' best day is truncated.
      // It stays visible, but it never counts as a full forecast day.
      const coverage = coverageByEntry.get(source.entryId) ?? 0;
      const intervals = forecast?.dailyIntervals.get(key) ?? 0;
      if (cached !== undefined && coverage > 0 && intervals < coverage * COVERAGE_RATIO) {
        truncated = true;
      }
      return cached;
    });
    const usable =
      payload.sources.length > 0 &&
      values.every((value) => value !== undefined && Number.isFinite(value));
    if (!usable) continue;
    const forecastKwh = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    if (truncated) {
      issues.push({ key: `truncated:${key}`, code: "forecast_incomplete" });
    }
    days.push({
      dateKey: key,
      forecastKwh,
      totalKwh: forecastKwh,
      complete: !truncated,
      partial: truncated,
      isToday: false,
      sourceCount: values.length,
      expectedSourceCount: payload.sources.length,
    });
  }

  const completeDays = days.filter((day) => day.complete && day.totalKwh !== undefined);
  // The total always reports what is genuinely known. Only days that are complete
  // contribute, and the flag tells the view to mark the result as partial.
  // An optional production sensor never suppresses the total. Its absence or failure
  // only means today contributes the remaining forecast, which the tooltip explains.
  const periodComplete =
    days.every((day) => day.complete) &&
    payload.stale !== true &&
    !issues.some((issue) => issue.key.startsWith("series:"));
  const periodKwh =
    completeDays.length === 0
      ? null
      : completeDays.reduce((sum, day) => sum + (day.totalKwh ?? 0), 0);
  const averageKwh = periodKwh === null ? null : periodKwh / completeDays.length;
  const scaleValues = [
    ...completeDays.map((day) => day.totalKwh ?? 0),
    ...historyPayload.comparisons
      .filter((day) => day.complete)
      .flatMap((day) => [day.actualKwh ?? 0, day.forecastKwh ?? 0]),
  ];
  const maximum = scaleValues.reduce<number | null>(
    (max, value) => Math.max(max ?? 0, value),
    null,
  );
  return {
    historyDays: historyPayload.comparisons.filter((day) => day.complete),
    days,
    remainingKwh: todayForecast ?? null,
    periodKwh,
    averageKwh,
    maxKwh: maximum,
    periodComplete,
    issues,
    updatedAt: payload.fetchedAt,
  };
}
