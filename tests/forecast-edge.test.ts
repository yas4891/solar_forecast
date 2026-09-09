import { describe, expect, it } from "vitest";
import { clearForecastCache, loadForecastData, sumHourlyPeriods } from "../src/data/forecast";
import { discoverForecastSources } from "../src/data/sources";
import { energyKwh } from "../src/model/energy";
import { buildViewModel } from "../src/model/view-model";
import type { ForecastPayload, HassLike } from "../src/types";

const zone = "Europe/Berlin";
const now = Date.parse("2026-09-08T10:00:00Z");

function sourceHass(
  service: (entryId: string) => unknown | Promise<unknown>,
  connection: object = {},
): HassLike {
  return {
    connection,
    config: { time_zone: zone },
    states: {},
    callWS: async (message) => {
      if (message.type === "config_entries/get") {
        return [
          { entry_id: "east", domain: "forecast_solar", state: "loaded" },
          { entry_id: "west", domain: "forecast_solar", state: "loaded" },
        ] as never;
      }
      if (message.type === "config/entity_registry/list") return [] as never;
      if (message.type === "call_service") {
        const data = message.service_data as { config_entry: string };
        return service(data.config_entry) as never;
      }
      throw new Error(`Unexpected command ${String(message.type)}`);
    },
  };
}

describe("Forecast.Solar data boundaries", () => {
  it("processes each enabled source response once and aggregates their values", async () => {
    let serviceCalls = 0;
    const hass: HassLike = {
      config: { time_zone: zone },
      connection: {},
      states: {},
      callWS: async (message) => {
        if (message.type === "config_entries/get") {
          return [
            { entry_id: "east", domain: "forecast_solar", state: "loaded" },
            { entry_id: "west", domain: "forecast_solar", state: "loaded" },
          ] as never;
        }
        if (message.type === "config/entity_registry/list") return [] as never;
        if (message.type === "call_service") {
          serviceCalls += 1;
          return {
            context: {},
            response: {
              wh_period:
                serviceCalls === 1
                  ? { "2026-09-08T10:00:00Z": 1_250, "2026-09-09T10:00:00Z": 2_000 }
                  : { "2026-09-08T12:00:00Z": 750, "2026-09-09T12:00:00Z": 3_000 },
            },
          } as never;
        }
        throw new Error("Unexpected WebSocket command");
      },
    };

    const payload = await loadForecastData(hass, now);

    expect(serviceCalls).toBe(2);
    expect(payload.sourceForecasts.map((item) => item.dailyKwh.get("2026-09-08"))).toEqual([
      1.25, 0.75,
    ]);
    expect(payload.sourceForecasts.map((item) => item.dailyKwh.get("2026-09-09"))).toEqual([2, 3]);
  });

  it("uses the energy-dashboard series when the service is unavailable without retaining its stale error", async () => {
    const calls: string[] = [];
    const hass = sourceHass(async (entryId) => {
      calls.push(entryId);
      if (entryId === "east") throw { code: "not_found" };
      return { response: { wh_period: { "2026-09-09T12:00:00Z": 1_000 } } };
    });
    hass.callWS = async (message) => {
      if (message.type === "config_entries/get") {
        return [
          { entry_id: "east", domain: "forecast_solar", state: "loaded" },
          { entry_id: "west", domain: "forecast_solar", state: "loaded" },
        ] as never;
      }
      if (message.type === "config/entity_registry/list") return [] as never;
      if (message.type === "call_service") {
        const entryId = (message.service_data as { config_entry: string }).config_entry;
        return (await (entryId === "east"
          ? Promise.reject({ code: "not_found" })
          : Promise.resolve({
              response: { wh_period: { "2026-09-09T12:00:00Z": 1_000 } },
            }))) as never;
      }
      if (message.type === "energy/solar_forecast") {
        return { east: { wh_hours: { "2026-09-09T11:00:00Z": 2_000 } } } as never;
      }
      throw new Error("Unexpected command");
    };

    const payload = await loadForecastData(hass, now);

    expect(calls).toEqual([]);
    expect(payload.sourceForecasts.find((item) => item.source.entryId === "east")).toMatchObject({
      serviceFailed: false,
      issues: [],
    });
    expect(
      payload.sourceForecasts
        .find((item) => item.source.entryId === "east")
        ?.dailyKwh.get("2026-09-09"),
    ).toBe(2);
    expect(payload.issues).not.toContainEqual(
      expect.objectContaining({ key: "forecast:east", code: "forecast_unavailable" }),
    );
  });

  it("isolates connections, coalesces in-flight loading, and honours the five-minute cache TTL", async () => {
    let firstCalls = 0;
    let secondCalls = 0;
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = sourceHass(async () => {
      firstCalls += 1;
      await waiting;
      return { response: { wh_period: { "2026-09-09T12:00:00Z": 1_000 } } };
    });
    const second = sourceHass(() => {
      secondCalls += 1;
      return { response: { wh_period: { "2026-09-09T12:00:00Z": 2_000 } } };
    });
    clearForecastCache(first);
    clearForecastCache(second);

    const one = loadForecastData(first, now);
    const two = loadForecastData(first, now + 1);
    release();
    await Promise.all([one, two]);
    await loadForecastData(first, now + 299_999);
    await loadForecastData(first, now + 300_000);
    await loadForecastData(second, now);

    expect(firstCalls).toBe(4);
    expect(secondCalls).toBe(2);
  });

  it("bounds retries after an expired cache falls back to authoritative stale data", async () => {
    let discoveryCalls = 0;
    const hass: HassLike = {
      connection: {},
      config: { time_zone: zone },
      states: {},
      callWS: async (message) => {
        if (message.type === "config_entries/get") {
          discoveryCalls += 1;
          if (discoveryCalls > 1) throw new Error("temporary registry outage");
          return [{ entry_id: "east", domain: "forecast_solar", state: "loaded" }] as never;
        }
        if (message.type === "config/entity_registry/list") return [] as never;
        if (message.type === "call_service") {
          return { response: { wh_period: { "2026-09-09T12:00:00Z": 1_000 } } } as never;
        }
        throw new Error("Unexpected command");
      },
    };
    clearForecastCache(hass);

    const fresh = await loadForecastData(hass, now);
    const stale = await loadForecastData(hass, now + 300_001);
    const repeated = await loadForecastData(hass, now + 300_002);

    expect(fresh.sources).toEqual([{ entryId: "east" }]);
    expect(stale).toMatchObject({ stale: true, sources: [{ entryId: "east" }] });
    expect(stale.issues).toContainEqual(
      expect.objectContaining({ code: "source_discovery_failed" }),
    );
    expect(repeated).toEqual(stale);
    expect(discoveryCalls).toBe(2);
  });

  it("ignores disabled and non-Forecast.Solar sources while recognising renamed combined entities", async () => {
    const result = await discoverForecastSources({
      config: { time_zone: zone },
      states: {},
      callWS: async (message) => {
        if (message.type === "config_entries/get") {
          return [
            { entry_id: "active", domain: "forecast_solar", state: "loaded" },
            {
              entry_id: "disabled",
              domain: "forecast_solar",
              state: "loaded",
              disabled_by: "user",
            },
            { entry_id: "other", domain: "another_provider", state: "loaded" },
          ] as never;
        }
        return [
          {
            entity_id: "sensor.renamed_roof_remainder",
            platform: "forecast_solar",
            config_entry_id: "active",
            unique_id: "active_energy_production_today_remaining",
          },
          {
            entity_id: "sensor.renamed_roof_tomorrow",
            platform: "forecast_solar",
            config_entry_id: "active",
            unique_id: "active_energy_production_tomorrow",
          },
          {
            entity_id: "sensor.looks_similar",
            platform: "another_provider",
            config_entry_id: "other",
            unique_id: "other_energy_production_today_remaining",
          },
        ] as never;
      },
    });

    expect(result.sources).toEqual([
      {
        entryId: "active",
        remainingEntityId: "sensor.renamed_roof_remainder",
        tomorrowEntityId: "sensor.renamed_roof_tomorrow",
      },
    ]);
  });

  it("marks a full local day invalid after a negative or malformed interval", () => {
    const series = sumHourlyPeriods(
      {
        "2026-09-08T08:00:00Z": 1_000,
        "2026-09-08T09:00:00Z": -1,
        "2026-09-09T08:00:00Z": "not-a-number",
      },
      zone,
    );
    expect(series.kwh.get("2026-09-08")).toBeNaN();
    expect(series.kwh.get("2026-09-09")).toBeNaN();
  });

  it("keeps 23:00 local tomorrow in tomorrow and preserves DST-local date boundaries", () => {
    const series = sumHourlyPeriods(
      {
        "2026-09-09T21:00:00Z": 1_000,
        "2026-03-29T21:00:00Z": 2_000,
      },
      zone,
    );
    expect(series.kwh.get("2026-09-09")).toBe(1);
    expect(series.kwh.get("2026-03-29")).toBe(2);
    expect(series.kwh.has("2026-09-10")).toBe(false);
  });

  it("rejects invalid energy units and values without silently treating them as zero", () => {
    expect(
      energyKwh({ state: "3", attributes: { unit_of_measurement: "W" } }, "test").issue,
    ).toMatchObject({ code: "invalid_energy" });
    expect(
      energyKwh({ state: "-1", attributes: { unit_of_measurement: "kWh" } }, "test").issue,
    ).toMatchObject({ code: "invalid_energy" });
    expect(
      energyKwh({ state: "2", attributes: { unit_of_measurement: "MWh" } }, "test").value,
    ).toBe(2_000);
  });
});

describe("display completeness boundaries", () => {
  it("does not make today or tomorrow usable without all required mappings", () => {
    const payload: ForecastPayload = {
      sources: [{ entryId: "east" }],
      sourceForecasts: [
        {
          source: { entryId: "east" },
          dailyKwh: new Map(),
          dailyIntervals: new Map(),
          issues: [],
          fetchedAt: now,
        },
      ],
      issues: [],
      fetchedAt: now,
    };
    const model = buildViewModel(
      { config: { time_zone: zone }, states: {} },
      { type: "custom:solar-forecast-card" },
      payload,
      now,
    );

    expect(model.days).toHaveLength(1);
    expect(model.days[0]).toMatchObject({ isToday: true, complete: false, forecastKwh: undefined });
    expect(model.periodKwh).toBeNull();
    expect(model.issues).toContainEqual(expect.objectContaining({ code: "forecast_incomplete" }));
  });

  it("limits the view to five local days and includes today's actual energy in the maximum", () => {
    const source = { entryId: "east", remainingEntityId: "sensor.remaining" };
    const payload: ForecastPayload = {
      sources: [source],
      sourceForecasts: [
        {
          source,
          dailyKwh: new Map([
            ["2026-03-29", 1],
            ["2026-03-30", 2],
            ["2026-03-31", 3],
            ["2026-04-01", 4],
            ["2026-04-02", 5],
            ["2026-04-03", 99],
          ]),
          dailyIntervals: new Map(),
          issues: [],
          fetchedAt: now,
        },
      ],
      issues: [],
      fetchedAt: now,
    };
    const model = buildViewModel(
      {
        config: { time_zone: zone },
        states: {
          "sensor.remaining": { state: "1", attributes: { unit_of_measurement: "kWh" } },
          "sensor.production": { state: "10", attributes: { unit_of_measurement: "kWh" } },
        },
      },
      { type: "custom:solar-forecast-card", production_today_entity: "sensor.production" },
      payload,
      Date.parse("2026-03-29T10:00:00Z"),
    );

    expect(model.days.map((day) => day.dateKey)).toEqual([
      "2026-03-29",
      "2026-03-30",
      "2026-03-31",
      "2026-04-01",
      "2026-04-02",
    ]);
    expect(model.maxKwh).toBe(11);
  });
});
