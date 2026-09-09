import { describe, expect, it } from "vitest";
import { clearForecastCache, loadForecastData } from "../src/data/forecast";
import type { HassLike } from "../src/types";

const now = Date.parse("2026-09-08T10:00:00Z");

function hassWith(serviceResult: unknown | Promise<unknown>): {
  hass: HassLike;
  fallbackCalls: () => number;
} {
  let energyFallbackCalls = 0;
  const connection = {};
  return {
    hass: {
      connection,
      config: { time_zone: "Europe/Berlin" },
      states: {},
      callWS: async (message) => {
        if (message.type === "config_entries/get") {
          return [{ entry_id: "roof", domain: "forecast_solar", state: "loaded" }] as never;
        }
        if (message.type === "config/entity_registry/list") return [] as never;
        if (message.type === "call_service") return (await serviceResult) as never;
        if (message.type === "energy/solar_forecast") {
          energyFallbackCalls += 1;
          return { roof: { wh_hours: { "2026-09-09T08:00:00Z": 1000 } } } as never;
        }
        throw new Error("unexpected request");
      },
    },
    fallbackCalls: () => energyFallbackCalls,
  };
}

describe("Forecast.Solar schema failures", () => {
  it("shows a malformed successful response immediately and never hides it with the compatibility fallback", async () => {
    const setup = hassWith({ response: { wh_period: [] } });
    clearForecastCache(setup.hass);
    const payload = await loadForecastData(setup.hass, now);
    expect(payload.issues).toContainEqual(
      expect.objectContaining({
        code: "forecast_schema_invalid",
        immediate: true,
        sourceId: "roof",
      }),
    );
    expect(setup.fallbackCalls()).toBe(0);
  });

  it("treats a top-level wh_period as a schema error and never uses the fallback", async () => {
    const setup = hassWith({ wh_period: { "2026-09-09T08:00:00Z": 1000 } });
    clearForecastCache(setup.hass);
    const payload = await loadForecastData(setup.hass, now);
    expect(payload.issues).toContainEqual(
      expect.objectContaining({ code: "forecast_schema_invalid", immediate: true }),
    );
    expect(setup.fallbackCalls()).toBe(0);
  });

  it("treats known service validation codes as permanent schema errors", async () => {
    const setup = hassWith(Promise.reject({ code: "invalid_service_data" }));
    clearForecastCache(setup.hass);
    const payload = await loadForecastData(setup.hass, now);
    expect(payload.sourceForecasts[0]).toMatchObject({
      schemaInvalid: true,
    });
    expect(payload.sourceForecasts[0]?.serviceFailed).toBeUndefined();
    expect(setup.fallbackCalls()).toBe(0);
  });

  it("uses the compatibility series after an unsupported service error", async () => {
    const setup = hassWith(Promise.reject({ code: "not_found" }));
    clearForecastCache(setup.hass);
    const payload = await loadForecastData(setup.hass, now);
    expect(payload.sourceForecasts[0]?.dailyKwh.get("2026-09-09")).toBe(1);
    expect(payload.issues).not.toContainEqual(
      expect.objectContaining({ code: "forecast_schema_invalid" }),
    );
    expect(setup.fallbackCalls()).toBe(1);
  });

  it("does not call the fallback for a transient error and preserves the prior series as stale", async () => {
    let calls = 0;
    let fallbackCalls = 0;
    const connection = {};
    const hass: HassLike = {
      connection,
      config: { time_zone: "Europe/Berlin" },
      states: {},
      callWS: async (message) => {
        if (message.type === "config_entries/get") {
          return [{ entry_id: "roof", domain: "forecast_solar", state: "loaded" }] as never;
        }
        if (message.type === "config/entity_registry/list") return [] as never;
        if (message.type === "call_service") {
          calls += 1;
          if (calls > 1) throw new Error("timeout");
          return { response: { wh_period: { "2026-09-09T08:00:00Z": 1000 } } } as never;
        }
        if (message.type === "energy/solar_forecast") {
          fallbackCalls += 1;
          return {} as never;
        }
        throw new Error("unexpected request");
      },
    };
    clearForecastCache(hass);
    await loadForecastData(hass, now);
    const stale = await loadForecastData(hass, now + 300_001);
    expect(stale).toMatchObject({ stale: true });
    expect(stale.sourceForecasts[0]?.dailyKwh.get("2026-09-09")).toBe(1);
    expect(stale.sourceForecasts[0]?.serviceFailed).toBe(true);
    expect(fallbackCalls).toBe(0);
  });
});
