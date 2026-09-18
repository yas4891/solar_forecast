import { afterEach, describe, expect, it, vi } from "vitest";
import type { ForecastPayload, HistoryPayload } from "../src/types";

const forecastPayload: ForecastPayload = {
  sources: [],
  sourceForecasts: [],
  issues: [],
  fetchedAt: 0,
};
let resolveHistory: ((payload: HistoryPayload) => void) | undefined;

vi.mock("../src/data/forecast", () => ({ loadForecastData: vi.fn(async () => forecastPayload) }));
vi.mock("../src/data/history", () => ({
  loadHistoryData: vi.fn(
    () =>
      new Promise<HistoryPayload>((resolve) => {
        resolveHistory = resolve;
      }),
  ),
}));

import { SolarForecastCard } from "../src/solar-forecast-card";

describe("history completion across midnight", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
    resolveHistory = undefined;
  });

  it("does not adopt an old history payload after the local target day changes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-09-08T21:59:59.900Z");
    const card = new SolarForecastCard();
    card.hass = { states: {}, config: { time_zone: "Europe/Berlin" } };
    card.setConfig({
      type: "custom:solar-forecast-card",
      production_today_entity: "sensor.production_today",
      history_forecast_entity: "sensor.forecast_tomorrow",
    });
    document.body.append(card);
    await Promise.resolve();
    vi.setSystemTime("2026-09-08T22:00:00.100Z");
    resolveHistory?.({
      comparisons: [
        {
          dateKey: "2026-09-07",
          actualKwh: 12,
          forecastKwh: 10,
          forecastAt: 0,
          complete: true,
        },
      ],
      issues: [],
      fetchedAt: 0,
    });
    await Promise.resolve();
    expect(
      (card as unknown as { model?: { historyDays: unknown[] } }).model?.historyDays ?? [],
    ).toHaveLength(0);
    card.remove();
  });
});
