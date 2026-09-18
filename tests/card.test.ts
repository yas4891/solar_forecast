import { describe, expect, it, vi } from "vitest";

vi.mock("../src/data/forecast", () => ({
  loadForecastData: vi.fn(() => new Promise(() => undefined)),
}));
import { SolarForecastCard } from "../src/solar-forecast-card";
import type { CardViewModel } from "../src/types";

const model: CardViewModel = {
  historyDays: [],
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
    expect(card.shadowRoot?.textContent).not.toContain("REMAINING");
    card.remove();
  });

  it("renders a complete yesterday comparison before today", async () => {
    const card = new SolarForecastCard();
    card.hass = { states: {}, config: { time_zone: "Europe/Berlin" } };
    card.setConfig({ type: "custom:solar-forecast-card", language: "en" });
    document.body.append(card);
    (card as unknown as { model: CardViewModel }).model = {
      ...model,
      maxKwh: 30,
      historyDays: [
        {
          dateKey: "2026-09-06",
          actualKwh: 18,
          forecastKwh: 30,
          forecastAt: Date.parse("2026-09-05T17:00:00Z"),
          complete: true,
        },
      ],
    };
    await card.updateComplete;
    const days = card.shadowRoot?.querySelectorAll(".day");
    expect(days).toHaveLength(3);
    expect(days?.[0].classList).toContain("is-history");
    expect(days?.[0].querySelector(".history-forecast")).not.toBeNull();
    expect(days?.[0].querySelector("button")?.getAttribute("aria-label")).toContain(
      "Forecast at 19:00: 30.0 kWh",
    );
    card.remove();
  });

  it("clamps historical forecast lines at zero, half, and full scale", async () => {
    const card = new SolarForecastCard();
    card.hass = { states: {}, config: { time_zone: "Europe/Berlin" } };
    card.setConfig({ type: "custom:solar-forecast-card", language: "en" });
    document.body.append(card);
    (card as unknown as { model: CardViewModel }).model = {
      ...model,
      maxKwh: 20,
      historyDays: [0, 10, 20].map((forecastKwh, index) => ({
        dateKey: `2026-09-0${4 + index}`,
        actualKwh: 10,
        forecastKwh,
        forecastAt: 0,
        complete: true,
      })),
    };
    await card.updateComplete;
    const lines = card.shadowRoot?.querySelectorAll<HTMLElement>(".history-forecast");
    const linePositions = (lines ? [...lines] : []).map((line) =>
      line.style.getPropertyValue("--forecast-line-position"),
    );
    expect(lines).toHaveLength(3);
    expect(linePositions).toEqual(["0%", "50%", "100%"]);
    card.remove();
  });

  it("uses Home Assistant grid layout options and rejects another card type", () => {
    const card = new SolarForecastCard();
    expect(card.getCardSize()).toBe(8);
    expect(card.getGridOptions()).toEqual({
      rows: 8,
      columns: 12,
      min_rows: 4,
      min_columns: 6,
    });
    expect(card.getGridOptions()).not.toHaveProperty("max_rows");
    expect(() => card.setConfig({ type: "entities" })).toThrow("Invalid configuration");
  });

  it("puts the solar icon and period summary below an untruncated title", async () => {
    const card = new SolarForecastCard();
    card.hass = { states: {}, config: { time_zone: "Europe/Berlin" } };
    card.setConfig({
      type: "custom:solar-forecast-card",
      language: "en",
      name: "Solar forecast with a long custom title",
    });
    document.body.append(card);
    (card as unknown as { model: CardViewModel }).model = model;
    await card.updateComplete;

    const header = card.shadowRoot?.querySelector("header");
    const summary = header?.querySelector(".summary-wrap");
    expect(header?.querySelector("ha-icon[icon='mdi:solar-power']")).not.toBeNull();
    expect(header?.querySelector("h1")?.textContent).toBe(
      "Solar forecast with a long custom title",
    );
    expect(summary?.querySelector(".period-summary")?.textContent).toContain("PERIOD");
    expect(summary?.querySelector(".remaining")).toBeNull();
    expect(summary?.querySelector("p")).toBeNull();

    const button = summary?.querySelector<HTMLButtonElement>(".period-summary");
    const tooltip = summary?.querySelector<HTMLElement>("#tooltip-summary");
    expect(button?.getAttribute("aria-describedby")).toBe("tooltip-summary");
    button?.dispatchEvent(new FocusEvent("focus"));
    await card.updateComplete;
    expect(tooltip?.hidden).toBe(false);
    button?.dispatchEvent(new FocusEvent("blur"));
    await card.updateComplete;
    expect(tooltip?.hidden).toBe(true);
    button?.dispatchEvent(new MouseEvent("mouseenter"));
    await card.updateComplete;
    expect(tooltip?.hidden).toBe(false);
    button?.dispatchEvent(new MouseEvent("mouseleave"));
    await card.updateComplete;
    expect(tooltip?.hidden).toBe(true);
    button?.click();
    await card.updateComplete;
    expect(tooltip?.hidden).toBe(false);
    card.remove();
  });
});
