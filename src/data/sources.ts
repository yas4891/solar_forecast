import type { DataIssue, ForecastSource, HassLike } from "../types";

interface EntityRegistryEntry {
  entity_id: string;
  platform?: string;
  config_entry_id?: string;
  disabled_by?: string | null;
  unique_id?: string;
}

interface ConfigEntry {
  entry_id?: string;
  domain?: string;
  disabled_by?: string | null;
  state?: string;
}

export interface SourceDiscovery {
  sources: ForecastSource[];
  issues: DataIssue[];
}

/**
 * Finds combined Forecast.Solar integration entries, never their individual planes.
 * Entity registry access is available to normal dashboard users. Config-entry access
 * is optional, because Home Assistant may withhold it for non-admin users.
 */
export async function discoverForecastSources(hass: HassLike): Promise<SourceDiscovery> {
  if (!hass.callWS) {
    return { sources: [], issues: [{ key: "connection", code: "connection_unavailable" }] };
  }

  let configEntries: ConfigEntry[];
  try {
    configEntries = await hass.callWS<ConfigEntry[]>({
      type: "config_entries/get",
      domain: "forecast_solar",
    });
  } catch {
    return { sources: [], issues: [{ key: "sources", code: "source_discovery_failed" }] };
  }

  const issues: DataIssue[] = [];
  const byEntry = new Map<string, ForecastSource>();
  for (const entry of configEntries) {
    if (entry.domain !== "forecast_solar" || !entry.entry_id || entry.disabled_by != null) continue;
    byEntry.set(entry.entry_id, { entryId: entry.entry_id });
    if (entry.state !== "loaded") {
      issues.push({
        key: `source:${entry.entry_id}`,
        code: "forecast_unavailable",
        sourceId: entry.entry_id,
      });
    }
  }

  let registry: EntityRegistryEntry[] = [];
  try {
    registry = await hass.callWS<EntityRegistryEntry[]>({ type: "config/entity_registry/list" });
  } catch {
    issues.push({ key: "entity_registry", code: "source_discovery_failed" });
  }
  for (const entry of registry) {
    if (
      entry.platform !== "forecast_solar" ||
      !entry.config_entry_id ||
      entry.disabled_by != null
    ) {
      continue;
    }
    const expectedRemaining = `${entry.config_entry_id}_energy_production_today_remaining`;
    const expectedTomorrow = `${entry.config_entry_id}_energy_production_tomorrow`;
    if (entry.unique_id !== expectedRemaining && entry.unique_id !== expectedTomorrow) {
      continue;
    }
    const source = byEntry.get(entry.config_entry_id);
    // Registry entries without an enabled Forecast.Solar config entry are excluded.
    if (!source) continue;
    if (entry.unique_id === expectedRemaining) source.remainingEntityId = entry.entity_id;
    if (entry.unique_id === expectedTomorrow) source.tomorrowEntityId = entry.entity_id;
    byEntry.set(entry.config_entry_id, source);
  }

  return {
    sources: [...byEntry.values()].sort((a, b) => a.entryId.localeCompare(b.entryId)),
    issues,
  };
}
