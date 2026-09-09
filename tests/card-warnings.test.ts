import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/data/forecast", () => ({
  loadForecastData: vi.fn(() => new Promise(() => undefined)),
}));

import { SolarForecastCard } from "../src/solar-forecast-card";
import type { CardViewModel, DataIssue } from "../src/types";

const forecastIssue: DataIssue = {
  key: "forecast:east",
  code: "forecast_unavailable",
  sourceId: "east",
};
const connectionIssue: DataIssue = { key: "connection", code: "connection_unavailable" };
const schemaIssue = {
  key: "forecast-schema",
  code: "forecast_schema_invalid",
  immediate: true,
} as unknown as DataIssue;

function model(issues: DataIssue[]): CardViewModel {
  return {
    days: [],
    remainingKwh: null,
    periodKwh: null,
    averageKwh: null,
    maxKwh: null,
    periodComplete: false,
    issues,
    updatedAt: 0,
  };
}

function setModel(card: SolarForecastCard, issues: DataIssue[]): void {
  (card as unknown as { model: CardViewModel }).model = model(issues);
  (card as unknown as { syncWarningDelay: () => void }).syncWarningDelay();
}

describe("SolarForecastCard warnings", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it("delays warnings, lists only mature issues, and removes them on recovery", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const card = new SolarForecastCard();
    card.hass = { states: {}, config: { time_zone: "Europe/Berlin" } };
    card.setConfig({ type: "custom:solar-forecast-card", language: "en" });
    document.body.append(card);

    setModel(card, [forecastIssue]);
    vi.setSystemTime(179_999);
    setModel(card, [forecastIssue]);
    await card.updateComplete;
    expect(card.shadowRoot?.querySelector(".warning")).toBeNull();

    vi.setSystemTime(180_000);
    setModel(card, [forecastIssue]);
    await card.updateComplete;
    const warning = card.shadowRoot?.querySelector(".warning") as HTMLButtonElement;
    expect(warning).not.toBeNull();
    warning.dispatchEvent(new FocusEvent("focus"));
    await card.updateComplete;
    expect(card.shadowRoot?.querySelector("#tooltip-warning")?.textContent).toContain("east");
    expect(card.shadowRoot?.querySelector("#tooltip-warning")?.textContent).not.toContain(
      "Home Assistant is not connected.",
    );

    vi.setSystemTime(60_000);
    setModel(card, [forecastIssue, connectionIssue]);
    vi.setSystemTime(240_000);
    setModel(card, [forecastIssue, connectionIssue]);
    await card.updateComplete;
    expect(card.shadowRoot?.querySelector("#tooltip-warning")?.textContent).toContain(
      "Home Assistant is not connected.",
    );

    setModel(card, []);
    await card.updateComplete;
    expect(card.shadowRoot?.querySelector(".warning")).toBeNull();
  });

  it("keeps the first touch click open, then closes on a second click and resets on configuration", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const card = new SolarForecastCard();
    card.hass = { states: {}, config: { time_zone: "Europe/Berlin" } };
    card.setConfig({ type: "custom:solar-forecast-card" });
    document.body.append(card);
    setModel(card, [forecastIssue]);
    vi.setSystemTime(180_000);
    setModel(card, [forecastIssue]);
    await card.updateComplete;
    const warning = card.shadowRoot?.querySelector(".warning") as HTMLButtonElement;
    warning.dispatchEvent(new FocusEvent("focus"));
    warning.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await card.updateComplete;
    expect(card.shadowRoot?.querySelector("#tooltip-warning")?.hasAttribute("hidden")).toBe(false);
    warning.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await card.updateComplete;
    expect(card.shadowRoot?.querySelector("#tooltip-warning")?.hasAttribute("hidden")).toBe(true);

    card.setConfig({ type: "custom:solar-forecast-card", language: "de" });
    await card.updateComplete;
    expect(card.shadowRoot?.querySelector(".warning")).toBeNull();
  });

  it("shows an immediate schema warning without releasing transient warnings early", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const card = new SolarForecastCard();
    card.hass = { states: {}, config: { time_zone: "Europe/Berlin" } };
    card.setConfig({ type: "custom:solar-forecast-card", language: "en" });
    document.body.append(card);
    setModel(card, [schemaIssue, forecastIssue]);
    await card.updateComplete;
    const warning = card.shadowRoot?.querySelector(".warning") as HTMLButtonElement;
    expect(warning).not.toBeNull();
    warning.dispatchEvent(new FocusEvent("focus"));
    await card.updateComplete;
    const tooltip = card.shadowRoot?.querySelector("#tooltip-warning")?.textContent ?? "";
    expect(tooltip).toContain("forecast response is incompatible");
    expect(tooltip).not.toContain("east");

    vi.setSystemTime(180_000);
    setModel(card, [schemaIssue, forecastIssue]);
    await card.updateComplete;
    expect(card.shadowRoot?.querySelector("#tooltip-warning")?.textContent).toContain("east");

    setModel(card, []);
    await card.updateComplete;
    expect(card.shadowRoot?.querySelector(".warning")).toBeNull();
  });
});
