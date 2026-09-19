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

const SOLCAST_ENTITIES = {
  remaining: "get_remaining_today",
  tomorrow: "total_kwh_forecast_tomorrow",
  day3: "total_kwh_forecast_d3",
  day4: "total_kwh_forecast_d4",
  day5: "total_kwh_forecast_d5",
  mode: "estimate_mode",
} as const;

/**
 * Finds combined Forecast.Solar integration entries, never their individual planes.
 * Entity registry access is available to normal dashboard users. Config-entry access
 * is optional, because Home Assistant may withhold it for non-admin users.
 */
export async function discoverForecastSources(hass: HassLike): Promise<SourceDiscovery> {
  if (!hass.callWS) {
    return {
      sources: [],
      issues: [
        {
          key: "connection",
          code: "connection_unavailable",
          provider: "forecast_solar",
        },
      ],
    };
  }

  let configEntries: ConfigEntry[];
  try {
    configEntries = await hass.callWS<ConfigEntry[]>({
      type: "config_entries/get",
      domain: "forecast_solar",
    });
  } catch {
    return {
      sources: [],
      issues: [
        {
          key: "sources",
          code: "source_discovery_failed",
          provider: "forecast_solar",
        },
      ],
    };
  }

  const issues: DataIssue[] = [];
  const byEntry = new Map<string, ForecastSource>();
  for (const entry of configEntries) {
    if (entry.domain !== "forecast_solar" || !entry.entry_id || entry.disabled_by != null) continue;
    byEntry.set(entry.entry_id, { entryId: entry.entry_id, provider: "forecast_solar" });
    if (entry.state !== "loaded") {
      issues.push({
        key: `source:${entry.entry_id}`,
        code: "forecast_unavailable",
        sourceId: entry.entry_id,
        provider: "forecast_solar",
      });
    }
  }

  let registry: EntityRegistryEntry[] = [];
  try {
    registry = await hass.callWS<EntityRegistryEntry[]>({ type: "config/entity_registry/list" });
  } catch {
    issues.push({
      key: "entity_registry",
      code: "source_discovery_failed",
      provider: "forecast_solar",
    });
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

/** Finds the one combined Solcast entry and only its aggregate forecast entities. */
export async function discoverSolcastSources(hass: HassLike): Promise<SourceDiscovery> {
  if (!hass.callWS) {
    return {
      sources: [],
      issues: [
        {
          key: "solcast_solar:connection",
          code: "connection_unavailable",
          provider: "solcast_solar",
        },
      ],
    };
  }

  let configEntries: ConfigEntry[];
  try {
    configEntries = await hass.callWS<ConfigEntry[]>({
      type: "config_entries/get",
      domain: "solcast_solar",
    });
  } catch {
    return {
      sources: [],
      issues: [
        {
          key: "solcast_solar:sources",
          code: "source_discovery_failed",
          provider: "solcast_solar",
        },
      ],
    };
  }
  const enabled = configEntries.filter(
    (entry) => entry.domain === "solcast_solar" && entry.entry_id && entry.disabled_by == null,
  );
  if (enabled.length > 1) {
    return {
      sources: [],
      issues: [
        {
          key: "solcast_solar:entries",
          code: "solcast_ambiguous",
          provider: "solcast_solar",
        },
      ],
    };
  }
  const entry = enabled[0];
  if (!entry?.entry_id) return { sources: [], issues: [] };

  const source: ForecastSource = { entryId: entry.entry_id, provider: "solcast_solar" };
  const issues: DataIssue[] = [];
  if (entry.state !== "loaded") {
    issues.push({
      key: `solcast_solar:source:${entry.entry_id}`,
      code: "forecast_unavailable",
      sourceId: entry.entry_id,
      provider: "solcast_solar",
    });
  }
  let registry: EntityRegistryEntry[];
  try {
    registry = await hass.callWS<EntityRegistryEntry[]>({ type: "config/entity_registry/list" });
  } catch {
    return {
      sources: [source],
      issues: [
        ...issues,
        {
          key: "solcast_solar:entity_registry",
          code: "source_discovery_failed",
          provider: "solcast_solar",
        },
      ],
    };
  }
  const dailyEntityIds: Partial<Record<number, string>> = {};
  for (const entity of registry) {
    if (
      entity.platform !== "solcast_solar" ||
      entity.config_entry_id !== entry.entry_id ||
      entity.disabled_by != null ||
      !entity.unique_id
    ) {
      continue;
    }
    // These are Solcast's stable unique IDs. Entity names and entity IDs are mutable.
    if (entity.unique_id === SOLCAST_ENTITIES.remaining)
      source.remainingEntityId = entity.entity_id;
    if (entity.unique_id === SOLCAST_ENTITIES.tomorrow) {
      source.tomorrowEntityId = entity.entity_id;
      dailyEntityIds[1] = entity.entity_id;
    }
    if (entity.unique_id === SOLCAST_ENTITIES.day3) dailyEntityIds[2] = entity.entity_id;
    if (entity.unique_id === SOLCAST_ENTITIES.day4) dailyEntityIds[3] = entity.entity_id;
    if (entity.unique_id === SOLCAST_ENTITIES.day5) dailyEntityIds[4] = entity.entity_id;
    if (entity.unique_id === SOLCAST_ENTITIES.mode) source.estimateModeEntityId = entity.entity_id;
  }
  if (Object.keys(dailyEntityIds).length) source.dailyEntityIds = dailyEntityIds;
  return { sources: [source], issues };
}
