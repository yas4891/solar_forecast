import { describe, expect, it } from "vitest";
import { clearHistoryCache, loadHistoryData } from "../src/data/history";
import { localDayEnd, localDayStart, resolveLocalDateTime } from "../src/model/dates";
import type { HassLike } from "../src/types";

const now = Date.parse("2026-09-08T10:00:00Z");

describe("historical comparison data", () => {
  it("uses compressed states at 19:00 and before midnight", async () => {
    const requests: Record<string, unknown>[] = [];
    const hass: HassLike = {
      states: {},
      config: { time_zone: "Europe/Berlin" },
      connection: {},
      callWS: async (message) => {
        requests.push(message);
        const entity = (message.entity_ids as string[])[0];
        if (entity === "sensor.forecast_tomorrow") {
          return [
            [
              {
                s: "15",
                a: { unit_of_measurement: "kWh" },
                lu: 1_788_714_000,
              },
              {
                s: "99",
                a: { unit_of_measurement: "kWh" },
                lu: 1_788_717_200,
              },
            ],
          ] as never;
        }
        return [
          [
            {
              s: "11",
              a: { unit_of_measurement: "kWh" },
              lu: 1_788_818_280,
            },
            {
              s: "0",
              a: { unit_of_measurement: "kWh" },
              lu: 1_788_818_400,
            },
          ],
        ] as never;
      },
    };
    const result = await loadHistoryData(
      hass,
      {
        type: "custom:solar-forecast-card",
        production_today_entity: "sensor.production_today",
        history_forecast_entity: "sensor.forecast_tomorrow",
      },
      now,
    );
    expect(result.comparisons[0]).toMatchObject({
      dateKey: "2026-09-07",
      forecastKwh: 15,
      actualKwh: 11,
      complete: true,
    });
    expect(requests).toHaveLength(2);
    const forecastRequest = requests.find(
      (request) => (request.entity_ids as string[])[0] === "sensor.forecast_tomorrow",
    );
    expect(Date.parse(String(forecastRequest?.start_time))).toBeLessThan(1_788_714_000_000);
    expect(Date.parse(String(forecastRequest?.end_time))).toBeGreaterThan(1_788_714_000_000);
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "history/history_during_period",
          include_start_time_state: true,
          significant_changes_only: false,
          minimal_response: false,
          no_attributes: false,
        }),
      ]),
    );
  });

  it("does not use a forecast state that starts after 19:00", async () => {
    const hass: HassLike = {
      states: {},
      config: { time_zone: "Europe/Berlin" },
      connection: {},
      callWS: async (message) => {
        const entity = (message.entity_ids as string[])[0];
        return entity === "sensor.forecast_tomorrow"
          ? ([[{ s: "14", a: { unit_of_measurement: "kWh" }, lu: 1_788_717_201 }]] as never)
          : ([[{ s: "11", a: { unit_of_measurement: "kWh" }, lu: 1_788_818_280 }]] as never);
      },
    };
    const result = await loadHistoryData(
      hass,
      {
        type: "custom:solar-forecast-card",
        production_today_entity: "sensor.production_today",
        history_forecast_entity: "sensor.forecast_tomorrow",
      },
      now,
    );
    expect(result.comparisons[0]).toMatchObject({ forecastKwh: undefined, complete: false });
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "history_invalid" }));
  });

  it("uses a state changed at exactly 19:00", async () => {
    const hass: HassLike = {
      states: {},
      config: { time_zone: "Europe/Berlin" },
      connection: {},
      callWS: async (message) => {
        const entity = (message.entity_ids as string[])[0];
        return entity === "sensor.forecast_tomorrow"
          ? ([
              [
                { s: "14", a: { unit_of_measurement: "kWh" }, lu: 1_788_713_999 },
                { s: "15", a: { unit_of_measurement: "kWh" }, lu: 1_788_714_000 },
              ],
            ] as never)
          : ([[{ s: "11", a: { unit_of_measurement: "kWh" }, lu: 1_788_818_280 }]] as never);
      },
    };
    const result = await loadHistoryData(
      hass,
      {
        type: "custom:solar-forecast-card",
        production_today_entity: "sensor.production_today",
        history_forecast_entity: "sensor.forecast_tomorrow",
      },
      now,
    );
    expect(result.comparisons[0]).toMatchObject({ forecastKwh: 15, complete: true });
  });

  it("accepts the entity-keyed compressed response form", async () => {
    const hass: HassLike = {
      states: {},
      config: { time_zone: "Europe/Berlin" },
      connection: {},
      callWS: async (message) => {
        const entity = (message.entity_ids as string[])[0];
        return {
          [entity]: [
            {
              s: entity === "sensor.forecast_tomorrow" ? "14" : "11",
              a: { unit_of_measurement: "kWh" },
              lu: entity === "sensor.forecast_tomorrow" ? 1_788_713_600 : 1_788_818_280,
            },
          ],
        } as never;
      },
    };
    const result = await loadHistoryData(
      hass,
      {
        type: "custom:solar-forecast-card",
        production_today_entity: "sensor.production_today",
        history_forecast_entity: "sensor.forecast_tomorrow",
      },
      now,
    );
    expect(result.comparisons[0]).toMatchObject({ forecastKwh: 14, actualKwh: 11, complete: true });
  });

  it("warns only when the historical forecast sensor lacks the production sensor", async () => {
    const hass: HassLike = { states: {}, config: { time_zone: "Europe/Berlin" }, connection: {} };
    const productionOnly = await loadHistoryData(
      hass,
      { type: "custom:solar-forecast-card", production_today_entity: "sensor.production_today" },
      now,
    );
    const forecastOnly = await loadHistoryData(
      hass,
      { type: "custom:solar-forecast-card", history_forecast_entity: "sensor.forecast_tomorrow" },
      now,
    );
    expect(productionOnly.issues).toEqual([]);
    expect(forecastOnly.issues).toContainEqual(
      expect.objectContaining({
        key: expect.stringContaining("history:configuration:"),
        code: "history_invalid",
      }),
    );
  });

  it("marks a malformed history response as an immediate schema issue", async () => {
    const hass: HassLike = {
      states: {},
      config: { time_zone: "Europe/Berlin" },
      connection: {},
      callWS: async () => ({ unexpected: true }) as never,
    };
    const result = await loadHistoryData(
      hass,
      {
        type: "custom:solar-forecast-card",
        production_today_entity: "sensor.production_today",
        history_forecast_entity: "sensor.forecast_tomorrow",
      },
      now,
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "history_schema_invalid", immediate: true }),
    );
  });

  it("treats an empty object as an empty history response", async () => {
    const hass: HassLike = {
      states: {},
      config: { time_zone: "Europe/Berlin" },
      connection: {},
      callWS: async () => ({}) as never,
    };
    const result = await loadHistoryData(
      hass,
      {
        type: "custom:solar-forecast-card",
        production_today_entity: "sensor.production_today",
        history_forecast_entity: "sensor.forecast_tomorrow",
      },
      now,
    );
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "history_invalid" }));
    expect(result.issues).not.toContainEqual(
      expect.objectContaining({ code: "history_schema_invalid" }),
    );
  });

  it("retries an unavailable history response after the error cache expires", async () => {
    let calls = 0;
    const hass: HassLike = {
      states: {},
      config: { time_zone: "Europe/Berlin" },
      connection: {},
      callWS: async () => {
        calls += 1;
        throw new Error("temporary history failure");
      },
    };
    await loadHistoryData(
      hass,
      {
        type: "custom:solar-forecast-card",
        production_today_entity: "sensor.production_today",
        history_forecast_entity: "sensor.forecast_tomorrow",
      },
      now,
    );
    await loadHistoryData(
      hass,
      {
        type: "custom:solar-forecast-card",
        production_today_entity: "sensor.production_today",
        history_forecast_entity: "sensor.forecast_tomorrow",
      },
      now + 1,
    );
    expect(calls).toBe(2);
    await loadHistoryData(
      hass,
      {
        type: "custom:solar-forecast-card",
        production_today_entity: "sensor.production_today",
        history_forecast_entity: "sensor.forecast_tomorrow",
      },
      now + 31_000,
    );
    expect(calls).toBe(4);
    clearHistoryCache(hass);
  });

  it("uses a new cache key after the local day changes", async () => {
    let calls = 0;
    const hass: HassLike = {
      states: {},
      config: { time_zone: "Europe/Berlin" },
      connection: {},
      callWS: async (message) => {
        calls += 1;
        const entity = (message.entity_ids as string[])[0];
        return {
          [entity]: [
            {
              s: entity === "sensor.forecast_tomorrow" ? "14" : "11",
              a: { unit_of_measurement: "kWh" },
              lu: entity === "sensor.forecast_tomorrow" ? 1_788_713_600 : 1_788_818_280,
            },
          ],
        } as never;
      },
    };
    const config = {
      type: "custom:solar-forecast-card",
      production_today_entity: "sensor.production_today",
      history_forecast_entity: "sensor.forecast_tomorrow",
    };
    await loadHistoryData(hass, config, now);
    await loadHistoryData(hass, config, now + 24 * 60 * 60 * 1000);
    expect(calls).toBe(4);
    clearHistoryCache(hass);
  });

  it("bounds completed history cache entries per connection", async () => {
    let calls = 0;
    const hass: HassLike = {
      states: {},
      config: { time_zone: "Europe/Berlin" },
      connection: {},
      callWS: async (message) => {
        calls += 1;
        const entity = (message.entity_ids as string[])[0];
        return {
          [entity]: [
            {
              s: entity.startsWith("sensor.forecast") ? "14" : "11",
              a: { unit_of_measurement: "kWh" },
              lu: entity.startsWith("sensor.forecast") ? 1_788_714_000 : 1_788_818_280,
            },
          ],
        } as never;
      },
    };
    for (let index = 0; index < 33; index += 1) {
      await loadHistoryData(
        hass,
        {
          type: "custom:solar-forecast-card",
          production_today_entity: "sensor.production_today",
          history_forecast_entity: `sensor.forecast_${index}`,
        },
        now,
      );
    }
    await loadHistoryData(
      hass,
      {
        type: "custom:solar-forecast-card",
        production_today_entity: "sensor.production_today",
        history_forecast_entity: "sensor.forecast_0",
      },
      now,
    );
    expect(calls).toBe(68);
    clearHistoryCache(hass);
  });

  it("keeps 23:55, 23:59:59.999, and excludes the midnight reset", async () => {
    const hass: HassLike = {
      states: {},
      config: { time_zone: "Europe/Berlin" },
      connection: {},
      callWS: async (message) => {
        const entity = (message.entity_ids as string[])[0];
        return entity === "sensor.forecast_tomorrow"
          ? ([[{ s: "14", a: { unit_of_measurement: "kWh" }, lu: 1_788_714_000 }]] as never)
          : ([
              [
                { s: "10", a: { unit_of_measurement: "kWh" }, lu: 1_788_818_100 },
                { s: "13", a: { unit_of_measurement: "kWh" }, lu: 1_788_818_399.999 },
                { s: "0", a: { unit_of_measurement: "kWh" }, lu: 1_788_818_400 },
              ],
            ] as never);
      },
    };
    const result = await loadHistoryData(
      hass,
      {
        type: "custom:solar-forecast-card",
        production_today_entity: "sensor.production_today",
        history_forecast_entity: "sensor.forecast_tomorrow",
      },
      now,
    );
    expect(result.comparisons[0]).toMatchObject({ actualKwh: 13, complete: true });
  });

  it("resolves normal, skipped, and repeated local times without offset guesses", () => {
    expect(resolveLocalDateTime("2026-09-06", 19, "Europe/Berlin")).toHaveLength(1);
    expect(resolveLocalDateTime("2026-03-29", 2, "Europe/Berlin", 30)).toHaveLength(0);
    expect(resolveLocalDateTime("2026-10-25", 2, "Europe/Berlin", 30)).toHaveLength(2);
  });

  it("finds 23-hour and 25-hour local days and rejects a skipped calendar date", () => {
    const springStart = localDayStart("2026-03-29", "Europe/Berlin");
    const springEnd = localDayStart("2026-03-30", "Europe/Berlin");
    const fallStart = localDayStart("2026-10-25", "Europe/Berlin");
    const fallEnd = localDayStart("2026-10-26", "Europe/Berlin");
    expect(springEnd! - springStart!).toBe(23 * 60 * 60 * 1000);
    expect(fallEnd! - fallStart!).toBe(25 * 60 * 60 * 1000);
    expect(localDayStart("2011-12-30", "Pacific/Apia")).toBeUndefined();
  });

  it("resolves Apia's 19:00 before its skipped calendar date", () => {
    const end = localDayEnd("2011-12-29", "Pacific/Apia");
    const nextStart = localDayStart("2011-12-31", "Pacific/Apia");
    expect(resolveLocalDateTime("2011-12-29", 19, "Pacific/Apia")).toHaveLength(1);
    expect(end).toBe(nextStart);
  });
});
