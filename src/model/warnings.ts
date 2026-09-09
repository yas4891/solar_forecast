import type { DataIssue } from "../types";

const DELAY_MS = 180_000;

/** Tracks continuous error duration independently from polling and rendering. */
export class WarningTracker {
  private readonly firstSeen = new Map<string, number>();
  private current = new Map<string, DataIssue>();

  update(issues: readonly DataIssue[], now = Date.now()): void {
    const next = new Map(issues.map((issue) => [issue.key, issue]));
    for (const key of this.current.keys()) {
      if (!next.has(key)) this.firstSeen.delete(key);
    }
    for (const key of next.keys()) {
      if (!this.firstSeen.has(key)) this.firstSeen.set(key, now);
    }
    this.current = next;
  }

  active(now = Date.now()): DataIssue[] {
    return [...this.current.values()].filter(
      (issue) => now - (this.firstSeen.get(issue.key) ?? now) >= DELAY_MS,
    );
  }

  nextDeadline(now = Date.now()): number | undefined {
    const deadlines = [...this.firstSeen.values()]
      .map((started) => started + DELAY_MS)
      .filter((deadline) => deadline > now);
    return deadlines.length === 0 ? undefined : Math.min(...deadlines);
  }

  reset(): void {
    this.firstSeen.clear();
    this.current.clear();
  }
}
