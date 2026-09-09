import { describe, expect, it } from "vitest";
import { SolarForecastCardEditor } from "../src/editor";
import type { CardConfig } from "../src/types";

describe("SolarForecastCardEditor", () => {
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

    const language = editor.shadowRoot?.querySelector("ha-select") as HTMLElement & {
      value: string;
    };
    language.value = "de";
    language.dispatchEvent(new Event("selected"));
    await editor.updateComplete;
    expect((language as unknown as { label: string }).label).toBe("Sprache");

    const entity = editor.shadowRoot?.querySelector("ha-entity-picker") as HTMLElement;
    entity.dispatchEvent(new CustomEvent("value-changed", { detail: { value: "" } }));
    expect(changes.at(-1)?.production_today_entity).toBeUndefined();

    editor.setConfig({ type: "custom:solar-forecast-card", name: "Solar roof", language: "en" });
    await editor.updateComplete;
    const title = editor.shadowRoot?.querySelector("ha-textfield") as HTMLElement & {
      value: string;
    };
    expect(title.value).toBe("Solar roof");
    editor.remove();
  });
});
