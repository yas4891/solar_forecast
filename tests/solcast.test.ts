import { describe, expect, it } from "vitest";
import { clearForecastCache, loadForecastData } from "../src/data/forecast";
import { discoverSolcastSources } from "../src/data/sources";
import { buildViewModel } from "../src/model/view-model";
import type { ForecastPayload, HassLike } from "../src/types";
import { createSolcastFixtureHass } from "./fixtures/home-assistant";

const zone = "Europe/Berlin";
const now = Date.parse("2026-09-08T10:00:00Z");

type WsHandler = (message: Record<string, unknown>) => unknown | Promise<unknown>;

interface HassSetup {
  forecastEntries?: unknown[];
  solcastEntries?: unknown[];
  registry?: unknown[];
  states?: HassLike["states"];
  configEntries?: WsHandler;
  registryHandler?: WsHandler;
  service?: WsHandler;
  energy?: WsHandler;
}

function createHass(setup: HassSetup): HassLike {
  return {
    connection: {},
    config: { time_zone: zone },
    states: setup.states ?? {},
    callWS: async <T>(message: Record<string, unknown>): Promise<T> => {
      if (message.type === "config_entries/get") {
        if (setup.configEntries) return (await setup.configEntries(message)) as T;
        return (
          message.domain === "forecast_solar"
            ? (setup.forecastEntries ?? [])
            : (setup.solcastEntries ?? [])
        ) as T;
      }
      if (message.type === "config/entity_registry/list") {
        if (setup.registryHandler) return (await setup.registryHandler(message)) as T;
        return (setup.registry ?? []) as T;
      }
      if (message.type === "call_service") return (await setup.service?.(message)) as T;
      if (message.type === "energy/solar_forecast") return (await setup.energy?.(message)) as T;
      throw new Error(`Unexpected command: ${String(message.type)}`);
    },
  };
}

const solcastRegistry = (entryId = "solcast"): unknown[] => [
  {
    entity_id: "sensor.solcast_mode",
    platform: "solcast_solar",
    config_entry_id: entryId,
    unique_id: "estimate_mode",
  },
  {
    entity_id: "sensor.solcast_remaining",
    platform: "solcast_solar",
    config_entry_id: entryId,
    unique_id: "get_remaining_today",
  },
  {
    entity_id: "sensor.solcast_tomorrow",
    platform: "solcast_solar",
    config_entry_id: entryId,
    unique_id: "total_kwh_forecast_tomorrow",
  },
];

const solcastRows = [
  {
    period_start: "2026-09-08T10:00:00Z",
    pv_estimate: 2,
    pv_estimate10: 3,
    pv_estimate90: 4,
  },
  {
    period_start: "2026-09-08T10:30:00Z",
    pv_estimate: 2,
    pv_estimate10: 3,
    pv_estimate90: 4,
  },
];

function rowsForHalfHourDay(start: string, intervals: number): unknown[] {
  const first = Date.parse(start);
  return Array.from({ length: intervals }, (_, index) => ({
    period_start: new Date(first + index * 30 * 60_000).toISOString(),
    pv_estimate: 1,
  }));
}

describe("Solcast provider selection", () => {
  it("selects Solcast automatically when it is the only configured provider", async () => {
    const hass = createSolcastFixtureHass();
    clearForecastCache(hass);

    const payload = await loadForecastData(hass, now);

    expect(payload.provider).toBe("solcast_solar");
    expect(payload.sources).toHaveLength(1);
  });

  it("selects Solcast automatically when every Forecast.Solar entry is disabled", async () => {
    const calls: string[] = [];
    const hass = createHass({
      forecastEntries: [
        {
          entry_id: "disabled-forecast",
          domain: "forecast_solar",
          state: "loaded",
          disabled_by: "user",
        },
      ],
      solcastEntries: [{ entry_id: "solcast", domain: "solcast_solar", state: "loaded" }],
      registry: solcastRegistry(),
      states: { "sensor.solcast_mode": { state: "estimate" } },
      service: (message) => {
        calls.push(String(message.domain));
        return { response: { data: solcastRows } };
      },
    });

    const payload = await loadForecastData(hass, now);

    expect(payload.provider).toBe("solcast_solar");
    expect(calls).toEqual(["solcast_solar"]);
  });

  it("keeps an enabled unloaded Forecast.Solar entry ahead of Solcast automatically", async () => {
    const calls: string[] = [];
    const hass = createHass({
      forecastEntries: [{ entry_id: "forecast", domain: "forecast_solar", state: "setup_retry" }],
      solcastEntries: [{ entry_id: "solcast", domain: "solcast_solar", state: "loaded" }],
      service: (message) => {
        calls.push(String(message.domain));
        return { response: { wh_period: { "2026-09-09T10:00:00Z": 1000 } } };
      },
    });

    const payload = await loadForecastData(hass, now);

    expect(payload.provider).toBe("forecast_solar");
    expect(calls).toEqual(["forecast_solar"]);
  });

  it("blocks automatic Solcast selection when Forecast.Solar entry discovery fails", async () => {
    let solcastServiceCalls = 0;
    const hass = createHass({
      solcastEntries: [{ entry_id: "solcast", domain: "solcast_solar", state: "loaded" }],
      configEntries: (message) => {
        if (message.domain === "forecast_solar") throw new Error("permission denied");
        return [{ entry_id: "solcast", domain: "solcast_solar", state: "loaded" }];
      },
      service: () => {
        solcastServiceCalls += 1;
        return { response: { data: solcastRows } };
      },
    });

    const payload = await loadForecastData(hass, now);

    expect(payload.provider).toBeUndefined();
    expect(payload.issues).toContainEqual(
      expect.objectContaining({ code: "source_discovery_failed", provider: "forecast_solar" }),
    );
    expect(solcastServiceCalls).toBe(0);
  });

  it("allows automatic Solcast selection after a registry error with no Forecast.Solar entries", async () => {
    const hass = createHass({
      solcastEntries: [{ entry_id: "solcast", domain: "solcast_solar", state: "loaded" }],
      configEntries: (message) =>
        message.domain === "forecast_solar"
          ? []
          : [{ entry_id: "solcast", domain: "solcast_solar", state: "loaded" }],
      registryHandler: () => Promise.reject(new Error("registry unavailable")),
      energy: () => ({ solcast: { wh_hours: { "2026-09-09T10:00:00Z": 2000 } } }),
    });

    const payload = await loadForecastData(hass, now);

    expect(payload.provider).toBe("solcast_solar");
  });

  it("prefers Forecast.Solar during automatic discovery when both integrations are configured", async () => {
    const calls: string[] = [];
    const hass = createHass({
      forecastEntries: [{ entry_id: "forecast", domain: "forecast_solar", state: "loaded" }],
      solcastEntries: [{ entry_id: "solcast", domain: "solcast_solar", state: "loaded" }],
      service: (message) => {
        calls.push(String(message.domain));
        return { response: { wh_period: { "2026-09-09T10:00:00Z": 1000 } } };
      },
    });

    const payload = await loadForecastData(hass, now);

    expect(payload.provider).toBe("forecast_solar");
    expect(calls).toEqual(["forecast_solar"]);
  });

  it("does not select Forecast.Solar when Solcast is explicitly requested", async () => {
    let serviceCalls = 0;
    const hass = createHass({
      forecastEntries: [{ entry_id: "forecast", domain: "forecast_solar", state: "loaded" }],
      service: () => {
        serviceCalls += 1;
        return { response: { wh_period: {} } };
      },
    });

    const payload = await loadForecastData(
      hass,
      { type: "custom:solar-forecast-card", forecast_provider: "solcast_solar" },
      now,
    );

    expect(payload.provider).toBeUndefined();
    expect(payload.issues).toContainEqual(
      expect.objectContaining({ code: "forecast_provider_unavailable", provider: "solcast_solar" }),
    );
    expect(serviceCalls).toBe(0);
  });

  it("excludes disabled Solcast entries and retains unloaded enabled entries", async () => {
    const disabled = await discoverSolcastSources(
      createHass({
        solcastEntries: [
          {
            entry_id: "disabled",
            domain: "solcast_solar",
            state: "loaded",
            disabled_by: "user",
          },
        ],
      }),
    );
    const unloaded = await discoverSolcastSources(
      createHass({
        solcastEntries: [{ entry_id: "waiting", domain: "solcast_solar", state: "setup_retry" }],
      }),
    );

    expect(disabled).toEqual({ sources: [], issues: [] });
    expect(unloaded.sources).toEqual([{ entryId: "waiting", provider: "solcast_solar" }]);
    expect(unloaded.issues).toContainEqual(
      expect.objectContaining({ code: "forecast_unavailable", sourceId: "waiting" }),
    );
  });

  it("rejects more than one enabled Solcast entry", async () => {
    const result = await discoverSolcastSources(
      createHass({
        solcastEntries: [
          { entry_id: "one", domain: "solcast_solar", state: "loaded" },
          { entry_id: "two", domain: "solcast_solar", state: "loaded" },
        ],
      }),
    );

    expect(result.sources).toEqual([]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "solcast_ambiguous", provider: "solcast_solar" }),
    );
  });

  it("uses only exact Solcast unique IDs for aggregate sensors", async () => {
    const result = await discoverSolcastSources(
      createHass({
        solcastEntries: [{ entry_id: "solcast", domain: "solcast_solar", state: "loaded" }],
        registry: [
          ...solcastRegistry(),
          {
            entity_id: "sensor.looks_like_remaining",
            platform: "solcast_solar",
            config_entry_id: "solcast",
            unique_id: "get_remaining_today_extra",
          },
          {
            entity_id: "sensor.day_three",
            platform: "solcast_solar",
            config_entry_id: "solcast",
            unique_id: "total_kwh_forecast_d3",
          },
          {
            entity_id: "sensor.day_four",
            platform: "solcast_solar",
            config_entry_id: "solcast",
            unique_id: "total_kwh_forecast_d4",
          },
          {
            entity_id: "sensor.day_five",
            platform: "solcast_solar",
            config_entry_id: "solcast",
            unique_id: "total_kwh_forecast_d5",
          },
        ],
      }),
    );

    expect(result.sources).toEqual([
      {
        entryId: "solcast",
        provider: "solcast_solar",
        remainingEntityId: "sensor.solcast_remaining",
        tomorrowEntityId: "sensor.solcast_tomorrow",
        estimateModeEntityId: "sensor.solcast_mode",
        dailyEntityIds: {
          1: "sensor.solcast_tomorrow",
          2: "sensor.day_three",
          3: "sensor.day_four",
          4: "sensor.day_five",
        },
      },
    ]);
  });
});

describe("Solcast data loading", () => {
  it.each([
    ["estimate", 2],
    ["estimate10", 3],
    ["estimate90", 4],
  ] as const)("converts the %s mode from half-hour kW values into kWh", async (mode, expected) => {
    const hass = createSolcastFixtureHass({ mode });
    clearForecastCache(hass);

    const payload = await loadForecastData(
      hass,
      { type: "custom:solar-forecast-card", forecast_provider: "solcast_solar" },
      now,
    );

    expect(payload.provider).toBe("solcast_solar");
    expect(payload.sourceForecasts[0]?.dailyKwh.get("2026-09-08")).toBe(expected);
    expect(payload.sourceForecasts[0]?.dailyIntervals.get("2026-09-08")).toBe(2);
  });

  it.each([
    ["2026-03-29", "2026-03-28T23:00:00Z", 46, "2026-03-28T10:00:00Z"],
    ["2026-09-09", "2026-09-08T22:00:00Z", 48, "2026-09-08T10:00:00Z"],
    ["2026-10-25", "2026-10-24T22:00:00Z", 50, "2026-10-24T10:00:00Z"],
  ] as const)(
    "accepts %d half-hour intervals as a complete local day",
    async (dateKey, start, intervals, testNow) => {
      const currentNow = Date.parse(testNow);
      const hass = createHass({
        solcastEntries: [{ entry_id: "solcast", domain: "solcast_solar", state: "loaded" }],
        registry: solcastRegistry(),
        states: {
          "sensor.solcast_mode": { state: "estimate" },
          "sensor.solcast_remaining": {
            state: "4",
            attributes: { unit_of_measurement: "kWh" },
          },
        },
        service: () => ({ response: { data: rowsForHalfHourDay(start, intervals) } }),
      });

      const payload = await loadForecastData(
        hass,
        { type: "custom:solar-forecast-card", forecast_provider: "solcast_solar" },
        currentNow,
      );
      const model = buildViewModel(
        hass,
        { type: "custom:solar-forecast-card", forecast_provider: "solcast_solar" },
        payload,
        currentNow,
      );

      expect(model.days.find((day) => day.dateKey === dateKey)).toMatchObject({
        complete: true,
        partial: false,
      });
    },
  );

  it("sends only the Solcast query service with ISO time limits", async () => {
    let request: Record<string, unknown> | undefined;
    const hass = createHass({
      solcastEntries: [{ entry_id: "solcast", domain: "solcast_solar", state: "loaded" }],
      registry: solcastRegistry(),
      states: { "sensor.solcast_mode": { state: "estimate" } },
      service: (message) => {
        request = message;
        return { response: { data: solcastRows } };
      },
    });

    await loadForecastData(
      hass,
      { type: "custom:solar-forecast-card", forecast_provider: "solcast_solar" },
      now,
    );

    const data = request?.service_data as Record<string, unknown>;
    expect(request).toMatchObject({
      type: "call_service",
      domain: "solcast_solar",
      service: "query_forecast_data",
      return_response: true,
    });
    expect(Object.keys(data).sort()).toEqual(["end_date_time", "start_date_time"]);
    expect(data.start_date_time).toBe(new Date(now).toISOString());
    expect(new Date(String(data.end_date_time)).toISOString()).toBe(data.end_date_time);
    expect(data).not.toHaveProperty("site");
    expect(data).not.toHaveProperty("undampened");
  });

  it("never returns or caches a delayed response for an obsolete Solcast mode", async () => {
    let serviceCalls = 0;
    let markFirstService!: () => void;
    let releaseFirstService!: () => void;
    const firstServiceStarted = new Promise<void>((resolve) => {
      markFirstService = resolve;
    });
    const firstServiceReleased = new Promise<void>((resolve) => {
      releaseFirstService = resolve;
    });
    const hass = createHass({
      solcastEntries: [{ entry_id: "solcast", domain: "solcast_solar", state: "loaded" }],
      registry: solcastRegistry(),
      states: { "sensor.solcast_mode": { state: "estimate" } },
      service: async () => {
        serviceCalls += 1;
        if (serviceCalls === 1) {
          markFirstService();
          await firstServiceReleased;
        }
        return { response: { data: solcastRows } };
      },
    });
    clearForecastCache(hass);

    const oldMode = loadForecastData(
      hass,
      { type: "custom:solar-forecast-card", forecast_provider: "solcast_solar" },
      now,
    );
    await firstServiceStarted;
    hass.states["sensor.solcast_mode"] = { state: "estimate90" };
    const currentMode = await loadForecastData(
      hass,
      { type: "custom:solar-forecast-card", forecast_provider: "solcast_solar" },
      now + 1,
    );
    releaseFirstService();
    const delayedMode = await oldMode;

    expect(serviceCalls).toBe(2);
    expect(currentMode.stale).not.toBe(true);
    expect(delayedMode.stale).not.toBe(true);
    expect(currentMode.sourceForecasts[0]?.dailyKwh.get("2026-09-08")).toBe(4);
    expect(delayedMode.sourceForecasts[0]?.dailyKwh.get("2026-09-08")).toBe(4);
  });

  it("marks empty Solcast energy fields as invalid instead of treating them as zero", async () => {
    const hass = createHass({
      solcastEntries: [{ entry_id: "solcast", domain: "solcast_solar", state: "loaded" }],
      registry: solcastRegistry(),
      states: { "sensor.solcast_mode": { state: "estimate" } },
      service: () => ({
        response: { data: [{ period_start: "2026-09-08T10:00:00Z", pv_estimate: "" }] },
      }),
    });

    const payload = await loadForecastData(
      hass,
      { type: "custom:solar-forecast-card", forecast_provider: "solcast_solar" },
      now,
    );

    expect(payload.sourceForecasts[0]?.dailyKwh.get("2026-09-08")).toBeNaN();
    expect(payload.issues).toContainEqual(expect.objectContaining({ code: "invalid_energy" }));
  });

  it("blocks every fallback when Solcast returns an incompatible response schema", async () => {
    let energyCalls = 0;
    const hass = createHass({
      solcastEntries: [{ entry_id: "solcast", domain: "solcast_solar", state: "loaded" }],
      registry: solcastRegistry(),
      states: { "sensor.solcast_mode": { state: "estimate" } },
      service: () => ({ response: { data: {} } }),
      energy: () => {
        energyCalls += 1;
        return { solcast: { wh_hours: { "2026-09-09T10:00:00Z": 1000 } } };
      },
    });

    const payload = await loadForecastData(
      hass,
      { type: "custom:solar-forecast-card", forecast_provider: "solcast_solar" },
      now,
    );

    expect(payload.issues).toContainEqual(
      expect.objectContaining({ code: "forecast_schema_invalid", immediate: true }),
    );
    expect(energyCalls).toBe(0);
  });

  it("does not use Solcast daily sensors after an incompatible service response", async () => {
    const hass = createHass({
      solcastEntries: [{ entry_id: "solcast", domain: "solcast_solar", state: "loaded" }],
      registry: solcastRegistry(),
      states: {
        "sensor.solcast_mode": { state: "estimate" },
        "sensor.solcast_remaining": {
          state: "4",
          attributes: { unit_of_measurement: "kWh" },
        },
        "sensor.solcast_tomorrow": {
          state: "7",
          attributes: { unit_of_measurement: "kWh" },
        },
      },
      service: () => ({ response: { data: {} } }),
      energy: () => ({ solcast: { wh_hours: { "2026-09-09T10:00:00Z": 1000 } } }),
    });

    const payload = await loadForecastData(
      hass,
      { type: "custom:solar-forecast-card", forecast_provider: "solcast_solar" },
      now,
    );
    const model = buildViewModel(
      hass,
      { type: "custom:solar-forecast-card", forecast_provider: "solcast_solar" },
      payload,
      now,
    );

    expect(model.days.find((day) => day.dateKey === "2026-09-09")).toBeUndefined();
  });

  it("uses Energy Dashboard data when the Solcast query service is unavailable", async () => {
    let energyCalls = 0;
    const hass = createHass({
      solcastEntries: [{ entry_id: "solcast", domain: "solcast_solar", state: "loaded" }],
      registry: solcastRegistry(),
      states: { "sensor.solcast_mode": { state: "estimate" } },
      service: () => Promise.reject({ code: "not_found" }),
      energy: () => {
        energyCalls += 1;
        return { solcast: { wh_hours: { "2026-09-09T10:00:00Z": 2000 } } };
      },
    });

    const payload = await loadForecastData(
      hass,
      { type: "custom:solar-forecast-card", forecast_provider: "solcast_solar" },
      now,
    );

    expect(payload.sourceForecasts[0]?.dailyKwh.get("2026-09-09")).toBe(2);
    expect(payload.sourceForecasts[0]?.serviceFailed).toBe(false);
    expect(energyCalls).toBe(1);
  });

  it("uses the allowed fallback path when the Solcast mode sensor is absent", async () => {
    let serviceCalls = 0;
    let energyCalls = 0;
    const hass = createHass({
      solcastEntries: [{ entry_id: "solcast", domain: "solcast_solar", state: "loaded" }],
      registry: solcastRegistry(),
      service: () => {
        serviceCalls += 1;
        return { response: { data: solcastRows } };
      },
      energy: () => {
        energyCalls += 1;
        return { solcast: { wh_hours: { "2026-09-09T10:00:00Z": 3000 } } };
      },
    });

    const payload = await loadForecastData(
      hass,
      { type: "custom:solar-forecast-card", forecast_provider: "solcast_solar" },
      now,
    );

    expect(payload.issues).toContainEqual(
      expect.objectContaining({ code: "solcast_mode_invalid" }),
    );
    expect(payload.sourceForecasts[0]?.dailyKwh.get("2026-09-09")).toBe(3);
    expect(serviceCalls).toBe(0);
    expect(energyCalls).toBe(1);
  });

  it("uses Solcast daily sensors when a future service series day is unavailable", () => {
    const source = {
      entryId: "solcast",
      provider: "solcast_solar" as const,
      remainingEntityId: "sensor.solcast_remaining",
      dailyEntityIds: { 1: "sensor.solcast_tomorrow" },
    };
    const payload: ForecastPayload = {
      provider: "solcast_solar",
      sources: [source],
      sourceForecasts: [
        {
          source,
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
      {
        config: { time_zone: zone },
        states: {
          "sensor.solcast_remaining": {
            state: "4",
            attributes: { unit_of_measurement: "kWh" },
          },
          "sensor.solcast_tomorrow": {
            state: "7",
            attributes: { unit_of_measurement: "kWh" },
          },
        },
      },
      { type: "custom:solar-forecast-card", forecast_provider: "solcast_solar" },
      payload,
      now,
    );

    expect(model.days.find((day) => day.dateKey === "2026-09-09")?.forecastKwh).toBe(7);
  });

  it("keeps provider caches separate and reloads when the Solcast mode changes", async () => {
    let forecastCalls = 0;
    let solcastCalls = 0;
    const hass = createHass({
      forecastEntries: [{ entry_id: "forecast", domain: "forecast_solar", state: "loaded" }],
      solcastEntries: [{ entry_id: "solcast", domain: "solcast_solar", state: "loaded" }],
      registry: solcastRegistry(),
      states: { "sensor.solcast_mode": { state: "estimate" } },
      service: (message) => {
        if (message.domain === "forecast_solar") {
          forecastCalls += 1;
          return { response: { wh_period: { "2026-09-09T10:00:00Z": 1000 } } };
        }
        solcastCalls += 1;
        return { response: { data: solcastRows } };
      },
    });
    clearForecastCache(hass);

    await loadForecastData(
      hass,
      { type: "custom:solar-forecast-card", forecast_provider: "forecast_solar" },
      now,
    );
    const estimate = await loadForecastData(
      hass,
      { type: "custom:solar-forecast-card", forecast_provider: "solcast_solar" },
      now,
    );
    hass.states["sensor.solcast_mode"] = { state: "estimate90" };
    const estimate90 = await loadForecastData(
      hass,
      { type: "custom:solar-forecast-card", forecast_provider: "solcast_solar" },
      now + 1,
    );

    expect(forecastCalls).toBe(1);
    expect(solcastCalls).toBe(2);
    expect(estimate.sourceForecasts[0]?.dailyKwh.get("2026-09-08")).toBe(2);
    expect(estimate90.sourceForecasts[0]?.dailyKwh.get("2026-09-08")).toBe(4);
  });

  it("shares an in-flight Solcast request between automatic and explicit selection", async () => {
    let serviceCalls = 0;
    let release!: () => void;
    let serviceStarted!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      serviceStarted = resolve;
    });
    const hass = createHass({
      forecastEntries: [],
      solcastEntries: [{ entry_id: "solcast", domain: "solcast_solar", state: "loaded" }],
      registry: solcastRegistry(),
      states: { "sensor.solcast_mode": { state: "estimate" } },
      service: async () => {
        serviceCalls += 1;
        serviceStarted();
        await waiting;
        return { response: { data: solcastRows } };
      },
    });
    clearForecastCache(hass);

    const automatic = loadForecastData(hass, now);
    const explicit = loadForecastData(
      hass,
      { type: "custom:solar-forecast-card", forecast_provider: "solcast_solar" },
      now,
    );
    await started;
    release();
    const [automaticPayload, explicitPayload] = await Promise.all([automatic, explicit]);

    expect(serviceCalls).toBe(1);
    expect(automaticPayload.provider).toBe("solcast_solar");
    expect(explicitPayload.provider).toBe("solcast_solar");
  });

  it("reuses automatic Solcast selections without repeating discovery", async () => {
    let forecastDiscoveryCalls = 0;
    let solcastDiscoveryCalls = 0;
    let registryCalls = 0;
    let serviceCalls = 0;
    const hass = createHass({
      configEntries: (message) => {
        if (message.domain === "forecast_solar") {
          forecastDiscoveryCalls += 1;
          return [];
        }
        solcastDiscoveryCalls += 1;
        return [{ entry_id: "solcast", domain: "solcast_solar", state: "loaded" }];
      },
      registryHandler: () => {
        registryCalls += 1;
        return solcastRegistry();
      },
      states: { "sensor.solcast_mode": { state: "estimate" } },
      service: () => {
        serviceCalls += 1;
        return { response: { data: solcastRows } };
      },
    });
    clearForecastCache(hass);

    const first = await loadForecastData(hass, now);
    const second = await loadForecastData(hass, now + 1);

    expect(second).toBe(first);
    expect(forecastDiscoveryCalls).toBe(1);
    expect(solcastDiscoveryCalls).toBe(1);
    expect(registryCalls).toBe(2);
    expect(serviceCalls).toBe(1);
  });

  it("rediscovers automatic Solcast selections after an estimate mode change", async () => {
    let forecastDiscoveryCalls = 0;
    let solcastDiscoveryCalls = 0;
    let registryCalls = 0;
    let serviceCalls = 0;
    const hass = createHass({
      configEntries: (message) => {
        if (message.domain === "forecast_solar") {
          forecastDiscoveryCalls += 1;
          return [];
        }
        solcastDiscoveryCalls += 1;
        return [{ entry_id: "solcast", domain: "solcast_solar", state: "loaded" }];
      },
      registryHandler: () => {
        registryCalls += 1;
        return solcastRegistry();
      },
      states: { "sensor.solcast_mode": { state: "estimate" } },
      service: () => {
        serviceCalls += 1;
        return { response: { data: solcastRows } };
      },
    });
    clearForecastCache(hass);

    await loadForecastData(hass, now);
    hass.states["sensor.solcast_mode"] = { state: "estimate90" };
    const changedMode = await loadForecastData(hass, now + 1);

    expect(changedMode.sourceForecasts[0]?.dailyKwh.get("2026-09-08")).toBe(4);
    expect(forecastDiscoveryCalls).toBe(2);
    expect(solcastDiscoveryCalls).toBe(2);
    expect(registryCalls).toBe(4);
    expect(serviceCalls).toBe(2);
  });

  it("does not let an explicit Solcast cache bypass automatic Forecast.Solar priority", async () => {
    let forecastCalls = 0;
    let solcastCalls = 0;
    const hass = createHass({
      forecastEntries: [{ entry_id: "forecast", domain: "forecast_solar", state: "loaded" }],
      solcastEntries: [{ entry_id: "solcast", domain: "solcast_solar", state: "loaded" }],
      registry: solcastRegistry(),
      states: { "sensor.solcast_mode": { state: "estimate" } },
      service: (message) => {
        if (message.domain === "forecast_solar") {
          forecastCalls += 1;
          return { response: { wh_period: { "2026-09-09T10:00:00Z": 1_000 } } };
        }
        solcastCalls += 1;
        return { response: { data: solcastRows } };
      },
    });
    clearForecastCache(hass);

    await loadForecastData(
      hass,
      { type: "custom:solar-forecast-card", forecast_provider: "solcast_solar" },
      now,
    );
    const automatic = await loadForecastData(hass, now + 1);

    expect(automatic.provider).toBe("forecast_solar");
    expect(forecastCalls).toBe(1);
    expect(solcastCalls).toBe(1);
  });
});
