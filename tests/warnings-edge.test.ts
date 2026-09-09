import { describe, expect, it } from "vitest";
import { WarningTracker } from "../src/model/warnings";
import type { DataIssue } from "../src/types";

const minute = 60_000;
const sourceIssue: DataIssue = {
  key: "forecast:east",
  code: "forecast_unavailable",
  sourceId: "east",
};
const connectionIssue: DataIssue = { key: "connection", code: "connection_unavailable" };

describe("WarningTracker edge cases", () => {
  it("tracks each issue independently and exposes the earliest pending deadline", () => {
    const tracker = new WarningTracker();
    tracker.update([sourceIssue], 0);
    tracker.update([sourceIssue, connectionIssue], minute);

    expect(tracker.active(3 * minute)).toEqual([sourceIssue]);
    expect(tracker.nextDeadline(3 * minute)).toBe(4 * minute);
    expect(tracker.active(4 * minute)).toEqual([sourceIssue, connectionIssue]);
  });

  it("resets a recovered issue's delay when it recurs", () => {
    const tracker = new WarningTracker();
    tracker.update([sourceIssue], 0);
    expect(tracker.active(3 * minute)).toEqual([sourceIssue]);

    tracker.update([], 3 * minute + 1);
    expect(tracker.active(99 * minute)).toEqual([]);
    tracker.update([sourceIssue], 100 * minute);

    expect(tracker.active(102 * minute + 59_999)).toEqual([]);
    expect(tracker.active(103 * minute)).toEqual([sourceIssue]);
  });

  it("keeps the original start time when polling repeats an unresolved issue", () => {
    const tracker = new WarningTracker();
    tracker.update([sourceIssue], 0);
    tracker.update([sourceIssue], minute);
    tracker.update([sourceIssue], 2 * minute);

    expect(tracker.nextDeadline(2 * minute)).toBe(3 * minute);
    expect(tracker.active(3 * minute)).toEqual([sourceIssue]);
  });

  it("clears all duration state on reset", () => {
    const tracker = new WarningTracker();
    tracker.update([sourceIssue, connectionIssue], 0);
    tracker.reset();

    expect(tracker.active(60 * minute)).toEqual([]);
    expect(tracker.nextDeadline(60 * minute)).toBeUndefined();
    tracker.update([sourceIssue], 60 * minute);
    expect(tracker.nextDeadline(60 * minute)).toBe(63 * minute);
  });
});
