import type { DataIssue, HassEntity } from "../types";
import { dateKeyAt } from "./dates";

const ENERGY_FACTORS: Record<string, number> = {
  wh: 1 / 1000,
  kwh: 1,
  mwh: 1000,
};

export function energyKwh(
  entity: HassEntity | undefined,
  issueKey: string,
  entityId?: string,
): { value?: number; issue?: DataIssue } {
  if (!entity) {
    return { issue: invalidEnergy(issueKey, entityId) };
  }
  const rawState = entity.state.trim();
  const rawUnit = entity.attributes?.unit_of_measurement;
  const value = rawState === "" ? Number.NaN : Number(rawState);
  const unit = typeof rawUnit === "string" ? rawUnit.trim().toLowerCase() : "";
  const factor = ENERGY_FACTORS[unit];
  if (!Number.isFinite(value) || value < 0 || factor === undefined) {
    return { issue: invalidEnergy(issueKey, entityId) };
  }
  return { value: value * factor };
}

export function invalidEnergy(key: string, entityId?: string): DataIssue {
  return { key, code: "invalid_energy", entityId };
}

export function isCurrentLocalDay(
  entity: HassEntity | undefined,
  expected: string,
  timeZone: string,
): boolean {
  const timestamp = entity?.last_reported ?? entity?.last_updated;
  if (!timestamp) return true;
  const updated = new Date(timestamp);
  return !Number.isNaN(updated.getTime()) && dateKeyAt(updated, timeZone) === expected;
}
