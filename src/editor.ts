import { LitElement, css, html, type PropertyValues } from "lit";
import { localize, supportedLocales } from "./localize";
import type { CardConfig, HassLike } from "./types";

export class SolarForecastCardEditor extends LitElement {
  static properties = { hass: { attribute: false }, config: { state: true } };
  declare public hass?: HassLike;
  declare private config: CardConfig;

  public constructor() {
    super();
    this.config = { type: "custom:solar-forecast-card" };
  }

  public setConfig(config: CardConfig): void {
    this.config = { ...config, type: "custom:solar-forecast-card" };
  }
  protected updated(changed: PropertyValues): void {
    if (changed.has("hass")) this.requestUpdate();
  }
  private t(key: Parameters<typeof localize>[0]): string {
    return localize(key, this.config.language, this.hass?.locale?.language || this.hass?.language);
  }
  private emit(config: CardConfig): void {
    this.config = config;
    this.dispatchEvent(
      new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }),
    );
  }
  private onText(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.emit({ ...this.config, name: value || undefined });
  }
  private onLanguage(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.emit({ ...this.config, language: value || undefined });
  }
  private onEntity(event: CustomEvent): void {
    const value = event.detail?.value ?? (event.target as HTMLInputElement).value;
    this.emit({ ...this.config, production_today_entity: value || undefined });
  }
  private onHistoryEntity(event: CustomEvent): void {
    const value = event.detail?.value ?? (event.target as HTMLInputElement).value;
    this.emit({ ...this.config, history_forecast_entity: value || undefined });
  }
  protected render() {
    const languages = supportedLocales();
    return html`<div class="editor">
      <ha-textfield
        .label=${this.t("name")}
        .value=${this.config.name || ""}
        @input=${this.onText}
      ></ha-textfield>
      <ha-select
        .label=${this.t("language")}
        .value=${this.config.language || ""}
        @selected=${this.onLanguage}
      >
        <mwc-list-item value="">${this.t("languageAuto")}</mwc-list-item>${Object.entries(
          languages,
        ).map(
          ([code, locale]) => html`<mwc-list-item value=${code}>${locale.name}</mwc-list-item>`,
        )}</ha-select
      >
      <ha-entity-picker
        .hass=${this.hass}
        .value=${this.config.production_today_entity || ""}
        .label=${this.t("productionTodayEntity")}
        .includeDomains=${["sensor"]}
        .includeDeviceClasses=${["energy"]}
        @value-changed=${this.onEntity}
      ></ha-entity-picker>
      <p>${this.t("productionTodayHelp")}</p>
      <ha-entity-picker
        .hass=${this.hass}
        .value=${this.config.history_forecast_entity || ""}
        .label=${this.t("historyForecastEntity")}
        .includeDomains=${["sensor"]}
        .includeDeviceClasses=${["energy"]}
        @value-changed=${this.onHistoryEntity}
      ></ha-entity-picker>
      <p>${this.t("historyForecastHelp")}</p>
    </div>`;
  }
  static styles = css`
    .editor {
      display: grid;
      gap: 16px;
    }
    .editor > * {
      width: 100%;
    }
    p {
      margin: 0;
      color: var(--secondary-text-color);
      font-size: 13px;
    }
  `;
}

if (!customElements.get("solar-forecast-card-editor"))
  customElements.define("solar-forecast-card-editor", SolarForecastCardEditor);
