import type { HassEntity, HassLike } from "../../src/types";

export type FixtureScenario = "two-days" | "five-days" | "no-production";

interface FixtureSource {
  entryId: string;
  remainingKwh: number;
  hourlyWh: number[];
}

const SOURCE_ENTRIES = [
  { entry_id: "roof-east", domain: "forecast_solar", state: "loaded", disabled_by: null },
  { entry_id: "roof-west", domain: "forecast_solar", state: "loaded", disabled_by: null },
  { entry_id: "disabled-roof", domain: "forecast_solar", state: "loaded", disabled_by: "user" },
];

function localDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function futureDate(dayOffset: number, timeZone: string): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return localDateKey(date, timeZone);
}

function periodsFor(values: number[], timeZone: string): Record<string, number> {
  return Object.fromEntries(
    values.flatMap((dailyWh, index) => {
      const day = futureDate(index, timeZone);
      return [
        [`${day}T08:00:00.000Z`, dailyWh * 0.3],
        [`${day}T12:00:00.000Z`, dailyWh * 0.4],
        [`${day}T16:00:00.000Z`, dailyWh * 0.3],
      ];
    }),
  );
}

function sourcesFor(scenario: FixtureScenario): FixtureSource[] {
  const dailyCount = scenario === "two-days" ? 2 : 5;
  const east = [8_000, 14_000, 19_000, 12_000, 17_000].slice(0, dailyCount);
  const west = [6_000, 11_000, 16_000, 10_000, 14_000].slice(0, dailyCount);
  return [
    { entryId: "roof-east", remainingKwh: east[0] / 1000, hourlyWh: east },
    { entryId: "roof-west", remainingKwh: west[0] / 1000, hourlyWh: west },
  ];
}

/**
 * A small deterministic Home Assistant surface for local card development.
 * It exercises config-entry discovery, entity-registry matching, and the
 * Forecast.Solar service response without contacting any external service.
 */
export function createFixtureHass(scenario: FixtureScenario): HassLike {
  const timeZone = "Europe/Berlin";
  const sources = sourcesFor(scenario);
  const states: Record<string, HassEntity> = {
    "sensor.production_today": {
      state: "12.4",
      attributes: { unit_of_measurement: "kWh", device_class: "energy" },
    },
  };
  for (const source of sources) {
    states[`sensor.${source.entryId}_remaining`] = {
      state: String(source.remainingKwh),
      attributes: { unit_of_measurement: "kWh", device_class: "energy" },
    };
    states[`sensor.${source.entryId}_tomorrow`] = {
      state: String(source.hourlyWh[1] / 1000),
      attributes: { unit_of_measurement: "kWh", device_class: "energy" },
    };
  }

  return {
    states,
    config: { time_zone: timeZone },
    connection: {},
    async callWS<T>(message: Record<string, unknown>): Promise<T> {
      if (message.type === "config_entries/get") return SOURCE_ENTRIES as T;
      if (message.type === "config/entity_registry/list") {
        return [
          ...sources.flatMap((source) => [
            {
              entity_id: `sensor.${source.entryId}_remaining`,
              platform: "forecast_solar",
              config_entry_id: source.entryId,
              unique_id: `${source.entryId}_energy_production_today_remaining`,
              disabled_by: null,
            },
            {
              entity_id: `sensor.${source.entryId}_tomorrow`,
              platform: "forecast_solar",
              config_entry_id: source.entryId,
              unique_id: `${source.entryId}_energy_production_tomorrow`,
              disabled_by: null,
            },
          ]),
          {
            entity_id: "sensor.disabled_roof_remaining",
            platform: "forecast_solar",
            config_entry_id: "disabled-roof",
            unique_id: "disabled-roof_energy_production_today_remaining",
            disabled_by: null,
          },
        ] as T;
      }
      if (message.type === "call_service") {
        const serviceData = message.service_data as { config_entry?: string } | undefined;
        const matching = sources.find((item) => item.entryId === serviceData?.config_entry);
        if (!matching) throw new Error("Unknown fixture Forecast.Solar source");
        return {
          context: { id: "fixture", parent_id: null, user_id: null },
          response: { watts: {}, wh_period: periodsFor(matching.hourlyWh, timeZone) },
        } as T;
      }
      if (message.type === "energy/solar_forecast") return {} as T;
      throw new Error(`Unsupported fixture WebSocket command: ${String(message.type)}`);
    },
  };
}
