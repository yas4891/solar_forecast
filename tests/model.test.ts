import { describe, expect, it } from "vitest";
import { buildViewModel } from "../src/model/view-model";
import { WarningTracker } from "../src/model/warnings";
import type { ForecastPayload, HassLike } from "../src/types";

const now = Date.parse("2026-09-08T10:00:00Z");
const source = {
  entryId: "one",
  remainingEntityId: "sensor.rest",
  tomorrowEntityId: "sensor.tomorrow",
};
function hass(states: HassLike["states"]): HassLike {
  return { config: { time_zone: "Europe/Berlin" }, states };
}
function payload(
  days = new Map<string, number>(),
  intervals = new Map<string, number>(),
): ForecastPayload {
  return {
    sources: [source],
    sourceForecasts: [
      { source, dailyKwh: days, dailyIntervals: intervals, issues: [], fetchedAt: now },
    ],
    issues: [],
    fetchedAt: now,
  };
}

describe("buildViewModel", () => {
  it("uses live remaining and production sensor values", () => {
    const model = buildViewModel(
      hass({
        "sensor.rest": { state: "8", attributes: { unit_of_measurement: "kWh" } },
        "sensor.production": { state: "12", attributes: { unit_of_measurement: "kWh" } },
      }),
      { type: "custom:solar-forecast-card", production_today_entity: "sensor.production" },
      payload(),
      now,
    );
    expect(model.days[0]).toMatchObject({
      forecastKwh: 8,
      productionKwh: 12,
      totalKwh: 20,
      complete: true,
    });
  });

  it("does not use yesterday's production after the local date changes", () => {
    const model = buildViewModel(
      hass({
        "sensor.rest": {
          state: "0",
          attributes: { unit_of_measurement: "kWh" },
          last_updated: "2026-09-08T07:00:00Z",
        },
        "sensor.production": {
          state: "12",
          attributes: { unit_of_measurement: "kWh" },
          last_updated: "2026-09-07T21:00:00Z",
        },
      }),
      { type: "custom:solar-forecast-card", production_today_entity: "sensor.production" },
      payload(),
      now,
    );
    expect(model.days[0].productionKwh).toBeUndefined();
    expect(model.issues.some((issue) => issue.code === "production_invalid")).toBe(true);
  });

  it("does not present a partial future total", () => {
    const second = { entryId: "two" };
    const day = "2026-09-09";
    const value = payload(new Map([[day, 4]]));
    value.sources = [source, second];
    value.sourceForecasts.push({
      source: second,
      dailyKwh: new Map(),
      dailyIntervals: new Map(),
      issues: [],
      fetchedAt: now,
    });
    const model = buildViewModel(
      hass({ "sensor.rest": { state: "2", attributes: { unit_of_measurement: "kWh" } } }),
      { type: "custom:solar-forecast-card" },
      value,
      now,
    );
    expect(model.days.map((item) => item.dateKey)).not.toContain(day);
    expect(model.periodKwh).toBeNull();
  });

  it("keeps valid zero forecasts visible", () => {
    const model = buildViewModel(
      hass({ "sensor.rest": { state: "0", attributes: { unit_of_measurement: "kWh" } } }),
      { type: "custom:solar-forecast-card" },
      payload(new Map([["2026-09-09", 0]])),
      now,
    );
    expect(model.days).toHaveLength(2);
    expect(model.maxKwh).toBe(0);
  });

  it("uses complete historical values in the scale but not the forward period", () => {
    const model = buildViewModel(
      hass({ "sensor.rest": { state: "8", attributes: { unit_of_measurement: "kWh" } } }),
      { type: "custom:solar-forecast-card" },
      payload(),
      now,
      {
        comparisons: [
          {
            dateKey: "2026-09-07",
            actualKwh: 12,
            forecastKwh: 30,
            forecastAt: Date.parse("2026-09-06T17:00:00Z"),
            complete: true,
          },
        ],
        issues: [],
        fetchedAt: now,
      },
    );
    expect(model.historyDays).toHaveLength(1);
    expect(model.periodKwh).toBe(8);
    expect(model.maxKwh).toBe(30);
  });

  it("keeps the same historical warning across forecast model refreshes", () => {
    const history = {
      comparisons: [],
      issues: [
        {
          key: "history:unavailable:2026-09-07:sensor.production:sensor.forecast",
          code: "history_unavailable" as const,
          entityId: "sensor.forecast",
        },
      ],
      fetchedAt: now,
    };
    const state = hass({
      "sensor.rest": { state: "8", attributes: { unit_of_measurement: "kWh" } },
    });
    const first = buildViewModel(
      state,
      { type: "custom:solar-forecast-card" },
      payload(),
      now,
      history,
    );
    const second = buildViewModel(
      state,
      { type: "custom:solar-forecast-card" },
      payload(),
      now + 60_000,
      history,
    );
    expect(second.issues.find((issue) => issue.code === "history_unavailable")?.key).toBe(
      first.issues.find((issue) => issue.code === "history_unavailable")?.key,
    );
  });

  it("clears a remaining-sensor error from an unchanged cached payload", () => {
    const state = hass({
      "sensor.rest": { state: "unknown", attributes: { unit_of_measurement: "kWh" } },
    });
    const cached = payload();
    expect(
      buildViewModel(state, { type: "custom:solar-forecast-card" }, cached, now).issues,
    ).toContainEqual(expect.objectContaining({ key: "remaining:one" }));
    state.states["sensor.rest"] = { state: "3", attributes: { unit_of_measurement: "kWh" } };
    expect(
      buildViewModel(state, { type: "custom:solar-forecast-card" }, cached, now).issues,
    ).not.toContainEqual(expect.objectContaining({ key: "remaining:one" }));
  });
});

describe("WarningTracker", () => {
  const issue = { key: "source:one", code: "forecast_unavailable" as const };
  it("delays warnings for a continuous three minutes and clears immediately", () => {
    const tracker = new WarningTracker();
    tracker.update([issue], 1_000);
    expect(tracker.active(180_999)).toEqual([]);
    expect(tracker.active(181_000)).toEqual([issue]);
    expect(tracker.nextDeadline(181_000)).toBeUndefined();
    tracker.update([], 181_001);
    expect(tracker.active(999_999)).toEqual([]);
  });
});
