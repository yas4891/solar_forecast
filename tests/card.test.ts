import { describe, expect, it, vi } from "vitest";

vi.mock("../src/data/forecast", () => ({
  loadForecastData: vi.fn(() => new Promise(() => undefined)),
}));
import { SolarForecastCard } from "../src/solar-forecast-card";
import type { CardViewModel } from "../src/types";

const model: CardViewModel = {
  days: [
    {
      dateKey: "2026-09-07",
      forecastKwh: 8,
      productionKwh: 12,
      totalKwh: 20,
      complete: true,
      partial: false,
      isToday: true,
      sourceCount: 1,
      expectedSourceCount: 1,
    },
    {
      dateKey: "2026-09-08",
      forecastKwh: 40,
      totalKwh: 40,
      complete: true,
      partial: false,
      isToday: false,
      sourceCount: 1,
      expectedSourceCount: 1,
    },
  ],
  remainingKwh: 8,
  periodKwh: 60,
  averageKwh: 30,
  maxKwh: 40,
  periodComplete: true,
  issues: [],
  updatedAt: 0,
};

describe("SolarForecastCard", () => {
  it("renders only supplied days and splits today's production", async () => {
    const card = new SolarForecastCard();
    card.hass = { states: {}, config: { time_zone: "Europe/Berlin" } };
    card.setConfig({ type: "custom:solar-forecast-card", language: "en" });
    document.body.append(card);
    (card as unknown as { model: CardViewModel }).model = model;
    await card.updateComplete;
    expect(card.shadowRoot?.querySelectorAll(".day")).toHaveLength(2);
    expect(card.shadowRoot?.querySelectorAll(".produced")).toHaveLength(1);
    expect(card.shadowRoot?.textContent).toContain("REMAINING");
    card.remove();
  });

  it("uses a stable card size and rejects another card type", () => {
    const card = new SolarForecastCard();
    expect(card.getCardSize()).toBe(8);
    expect(() => card.setConfig({ type: "entities" })).toThrow("Invalid configuration");
  });
});
