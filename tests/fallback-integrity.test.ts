import { expect, it } from "vitest";
import { loadForecastData } from "../src/data/forecast";
import { buildViewModel } from "../src/model/view-model";
import type { HassLike } from "../src/types";

it("marks retained compatibility data as partial when an interval date is unreadable", async () => {
  const now = Date.parse("2026-09-08T10:00:00Z");
  const hass: HassLike = {
    connection: {},
    config: { time_zone: "Europe/Berlin" },
    states: {
      "sensor.remaining": { state: "4", attributes: { unit_of_measurement: "kWh" } },
    },
    callWS: async (message) => {
      if (message.type === "config_entries/get") {
        return [{ entry_id: "roof", domain: "forecast_solar", state: "loaded" }] as never;
      }
      if (message.type === "config/entity_registry/list") {
        return [
          {
            entity_id: "sensor.remaining",
            platform: "forecast_solar",
            config_entry_id: "roof",
            unique_id: "roof_energy_production_today_remaining",
          },
        ] as never;
      }
      if (message.type === "call_service") throw { code: "not_found" };
      return {
        roof: {
          wh_hours: {
            "invalid-date": 1000,
            "2026-09-09T10:00:00Z": 2000,
          },
        },
      } as never;
    },
  };
  const payload = await loadForecastData(hass, now);
  const model = buildViewModel(hass, { type: "custom:solar-forecast-card" }, payload, now);
  expect(model.days.find((day) => day.dateKey === "2026-09-09")?.totalKwh).toBe(2);
  expect(model.periodKwh).toBe(6);
  expect(model.periodComplete).toBe(false);
  expect(model.issues).toContainEqual(expect.objectContaining({ key: "series:roof" }));
});
