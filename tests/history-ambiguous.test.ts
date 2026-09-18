import { describe, expect, it, vi } from "vitest";

vi.mock("../src/model/dates", () => ({
  dateKeyAt: () => "2026-09-08",
  dateKeyOffset: (dateKey: string, days: number) =>
    days === -1 ? "2026-09-07" : days === 1 ? "2026-09-08" : dateKey,
  localDayEnd: () => Date.parse("2026-09-07T22:00:00Z"),
  resolveLocalDateTime: () => [
    Date.parse("2026-09-06T17:00:00Z"),
    Date.parse("2026-09-06T18:00:00Z"),
  ],
}));

import { loadHistoryData } from "../src/data/history";
import type { HassLike } from "../src/types";

describe("ambiguous historical forecast time", () => {
  it("keeps a duplicated 19:00 forecast missing without querying history", async () => {
    const callWS = vi.fn();
    const hass: HassLike = {
      states: {},
      config: { time_zone: "Example/Repeated-19" },
      connection: {},
      callWS: async () => {
        callWS();
        return {} as never;
      },
    };
    const result = await loadHistoryData(
      hass,
      {
        type: "custom:solar-forecast-card",
        production_today_entity: "sensor.production_today",
        history_forecast_entity: "sensor.forecast_tomorrow",
      },
      Date.parse("2026-09-08T10:00:00Z"),
    );
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "history_invalid" }));
    expect(callWS).not.toHaveBeenCalled();
  });
});
