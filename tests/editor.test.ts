import { describe, expect, it } from "vitest";
import { SolarForecastCardEditor } from "../src/editor";
import type { CardConfig } from "../src/types";

describe("SolarForecastCardEditor", () => {
  it("shows title, language, provider, and the two optional energy entities", async () => {
    const editor = new SolarForecastCardEditor();
    editor.setConfig({ type: "custom:solar-forecast-card", language: "en" });
    document.body.append(editor);
    await editor.updateComplete;

    expect(editor.shadowRoot?.querySelectorAll("ha-textfield")).toHaveLength(1);
    expect(editor.shadowRoot?.querySelectorAll("ha-select")).toHaveLength(2);
    expect(editor.shadowRoot?.querySelectorAll("ha-entity-picker")).toHaveLength(2);
    expect(editor.shadowRoot?.querySelector("[name='height'], #height, .height")).toBeNull();
    expect(editor.shadowRoot?.textContent?.toLowerCase()).not.toContain("height");
    editor.remove();
  });

  it("updates translated fields and removes an optional production sensor", async () => {
    const editor = new SolarForecastCardEditor();
    const changes: CardConfig[] = [];
    editor.addEventListener("config-changed", (event) => {
      changes.push((event as CustomEvent<{ config: CardConfig }>).detail.config);
    });
    document.body.append(editor);
    editor.setConfig({
      type: "custom:solar-forecast-card",
      language: "en",
      production_today_entity: "sensor.production_today",
    });
    await editor.updateComplete;

    const language = editor.shadowRoot?.querySelectorAll("ha-select")[0] as HTMLElement & {
      value: string;
    };
    language.value = "de";
    language.dispatchEvent(new Event("selected"));
    await editor.updateComplete;
    expect((language as unknown as { label: string }).label).toBe("Sprache");

    const provider = editor.shadowRoot?.querySelectorAll("ha-select")[1] as HTMLElement & {
      value: string;
    };
    provider.value = "solcast_solar";
    provider.dispatchEvent(new Event("selected"));
    expect(changes.at(-1)?.forecast_provider).toBe("solcast_solar");
    provider.value = "";
    provider.dispatchEvent(new Event("selected"));
    expect(changes.at(-1)?.forecast_provider).toBeUndefined();

    const entity = editor.shadowRoot?.querySelector("ha-entity-picker") as HTMLElement;
    entity.dispatchEvent(new CustomEvent("value-changed", { detail: { value: "" } }));
    expect(changes.at(-1)?.production_today_entity).toBeUndefined();

    const historyEntity = editor.shadowRoot?.querySelectorAll("ha-entity-picker")[1] as HTMLElement;
    historyEntity.dispatchEvent(
      new CustomEvent("value-changed", { detail: { value: "sensor.forecast_tomorrow" } }),
    );
    expect(changes.at(-1)?.history_forecast_entity).toBe("sensor.forecast_tomorrow");

    editor.setConfig({ type: "custom:solar-forecast-card", name: "Solar roof", language: "en" });
    await editor.updateComplete;
    const title = editor.shadowRoot?.querySelector("ha-textfield") as HTMLElement & {
      value: string;
    };
    expect(title.value).toBe("Solar roof");
    expect(changes.at(-1)).not.toHaveProperty("height");
    editor.remove();
  });
});
