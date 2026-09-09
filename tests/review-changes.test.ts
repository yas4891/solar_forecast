import { describe, expect, it } from "vitest";
import { buildViewModel } from "../src/model/view-model";
import { sumHourlyPeriods } from "../src/data/forecast";
import { SolarForecastCard } from "../src/solar-forecast-card";
import type { ForecastPayload, HassLike } from "../src/types";

const zone = "Europe/Berlin";
const now = Date.parse("2026-09-08T10:00:00Z");
const source = { entryId: "east", remainingEntityId: "sensor.rest" };

function hass(states: HassLike["states"] = {}, extra: Partial<HassLike> = {}): HassLike {
  return { config: { time_zone: zone }, states, ...extra };
}

function payload(
  dailyKwh: Map<string, number>,
  dailyIntervals: Map<string, number>,
): ForecastPayload {
  return {
    sources: [source],
    sourceForecasts: [{ source, dailyKwh, dailyIntervals, issues: [], fetchedAt: now }],
    issues: [],
    fetchedAt: now,
  };
}

describe("truncated horizon days", () => {
  const dailyKwh = new Map([
    ["2026-09-09", 10],
    ["2026-09-10", 12],
    ["2026-09-11", 2],
  ]);

  it("keeps a truncated day visible, marks it, and excludes it from the total", () => {
    const model = buildViewModel(
      hass({ "sensor.rest": { state: "4", attributes: { unit_of_measurement: "kWh" } } }),
      { type: "custom:solar-forecast-card" },
      payload(
        dailyKwh,
        new Map([
          ["2026-09-09", 12],
          ["2026-09-10", 12],
          ["2026-09-11", 3],
        ]),
      ),
      now,
    );

    const last = model.days.find((day) => day.dateKey === "2026-09-11");
    expect(last).toMatchObject({ partial: true, complete: false, totalKwh: 2 });
    // 4 remaining today + 10 + 12. The truncated day never joins the total.
    expect(model.periodKwh).toBe(26);
    expect(model.averageKwh).toBe(26 / 3);
    expect(model.periodComplete).toBe(false);
    expect(model.maxKwh).toBe(12);
  });

  it("never invents a truncation when a full day is genuinely low", () => {
    const model = buildViewModel(
      hass({ "sensor.rest": { state: "4", attributes: { unit_of_measurement: "kWh" } } }),
      { type: "custom:solar-forecast-card" },
      payload(
        dailyKwh,
        new Map([
          ["2026-09-09", 12],
          ["2026-09-10", 12],
          ["2026-09-11", 11],
        ]),
      ),
      now,
    );

    expect(model.days.every((day) => day.complete)).toBe(true);
    expect(model.periodComplete).toBe(true);
    expect(model.periodKwh).toBe(28);
  });
});

describe("period total", () => {
  it("stays visible when only the optional production sensor is invalid", () => {
    const model = buildViewModel(
      hass({
        "sensor.rest": { state: "4", attributes: { unit_of_measurement: "kWh" } },
        "sensor.production": { state: "unavailable" },
      }),
      { type: "custom:solar-forecast-card", production_today_entity: "sensor.production" },
      payload(new Map([["2026-09-09", 10]]), new Map([["2026-09-09", 12]])),
      now,
    );

    expect(model.periodKwh).toBe(14);
    expect(model.periodComplete).toBe(true);
    expect(model.issues).toContainEqual(
      expect.objectContaining({ code: "production_invalid", entityId: "sensor.production" }),
    );
  });
});

describe("malformed series entries", () => {
  it("keeps the usable intervals instead of discarding the whole series", () => {
    const series = sumHourlyPeriods(
      { "not-a-timestamp": 1_000, "2026-09-09T08:00:00Z": 2_000 },
      zone,
    );

    expect(series.skippedTimestamps).toBe(1);
    expect(series.kwh.get("2026-09-09")).toBe(2);
    expect(series.intervals.get("2026-09-09")).toBe(1);
  });
});

describe("card language", () => {
  async function rendered(config: Record<string, unknown>, haLanguage: string): Promise<string> {
    const card = new SolarForecastCard();
    card.hass = hass({}, { locale: { language: haLanguage } });
    card.setConfig({ type: "custom:solar-forecast-card", ...config });
    document.body.append(card);
    await card.updateComplete;
    const text = card.shadowRoot?.textContent ?? "";
    card.remove();
    return text;
  }

  it("prefers the Home Assistant language over the browser language", async () => {
    expect(await rendered({}, "de")).toContain("Solarprognose");
  });

  it("lets an explicit card language override Home Assistant", async () => {
    expect(await rendered({ language: "en" }, "de")).toContain("Solar forecast");
  });
});
