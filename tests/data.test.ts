import { describe, expect, it } from "vitest";
import { discoverForecastSources } from "../src/data/sources";
import { sumHourlyPeriods } from "../src/data/forecast";
import type { HassLike } from "../src/types";

describe("forecast source discovery", () => {
  it("deduplicates entries and keeps entries with disabled forecast entities", async () => {
    const hass: HassLike = {
      states: {},
      config: { time_zone: "Europe/Berlin" },
      callWS: async (message) => {
        if (message.type === "config_entries/get")
          return [
            { entry_id: "a", domain: "forecast_solar", state: "loaded" },
            { entry_id: "b", domain: "forecast_solar", state: "loaded" },
          ] as never;
        return [
          {
            entity_id: "sensor.rest",
            platform: "forecast_solar",
            config_entry_id: "a",
            unique_id: "a_energy_production_today_remaining",
          },
          {
            entity_id: "sensor.plane",
            platform: "forecast_solar",
            config_entry_id: "a",
            unique_id: "plane",
          },
          {
            entity_id: "sensor.disabled",
            platform: "forecast_solar",
            config_entry_id: "b",
            unique_id: "b_energy_production_tomorrow",
            disabled_by: "integration",
          },
        ] as never;
      },
    };
    const result = await discoverForecastSources(hass);
    expect(result.sources).toEqual([
      { entryId: "a", provider: "forecast_solar", remainingEntityId: "sensor.rest" },
      { entryId: "b", provider: "forecast_solar" },
    ]);
  });
});

describe("hourly period aggregation", () => {
  it("uses Home Assistant local dates and invalidates malformed energy", () => {
    const series = sumHourlyPeriods(
      { "2026-09-08T22:00:00Z": 1000, "2026-09-08T23:00:00Z": null },
      "Europe/Berlin",
    );
    expect(series.kwh.get("2026-09-09")).toBeNaN();
    expect(series.intervals.get("2026-09-09")).toBe(2);
  });
});
