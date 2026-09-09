import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { localize, resolveLocale } from "./localize";
import { loadForecastData } from "./data/forecast";
import { buildViewModel } from "./model/view-model";
import { WarningTracker } from "./model/warnings";
import "./editor";
import type {
  CardConfig,
  CardViewModel,
  DailyForecast,
  DataIssue,
  ForecastPayload,
  HassLike,
} from "./types";

const REFRESH_MS = 5 * 60 * 1000;
interface VisibleIssue {
  key: string;
  text: string;
}

export class SolarForecastCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    model: { state: true },
    hoveredTooltip: { state: true },
    pinnedTooltip: { state: true },
    warningVisible: { state: true },
  };

  declare public hass?: HassLike;
  declare private model?: CardViewModel;
  declare private hoveredTooltip?: string;
  declare private pinnedTooltip?: string;
  declare private warningVisible: boolean;

  private config: CardConfig = { type: "custom:solar-forecast-card" };
  private refreshTimer?: number;
  private warningTimer?: number;
  private requestGeneration = 0;
  private watchedEntityIds: string[] = [];
  private watchedSignature?: string;
  private activeWarningSignature = "";
  private immediateIssues: DataIssue[] = [];
  private readonly warningTracker = new WarningTracker();

  public setConfig(config: CardConfig): void {
    if (!config || config.type !== "custom:solar-forecast-card") {
      throw new Error("Invalid configuration for solar-forecast-card");
    }
    this.config = { ...config };
    this.model = undefined;
    this.watchedEntityIds = [];
    this.watchedSignature = undefined;
    this.warningTracker.reset();
    this.activeWarningSignature = "";
    this.immediateIssues = [];
    this.warningVisible = false;
    this.requestGeneration += 1;
    this.refresh();
  }

  public getCardSize(): number {
    return 8;
  }

  public getGridOptions(): Record<string, number> {
    return { rows: 8, columns: 12, min_rows: 4, min_columns: 6 };
  }

  public static async getConfigElement(): Promise<HTMLElement> {
    return document.createElement("solar-forecast-card-editor");
  }

  public static getStubConfig(): CardConfig {
    return { type: "custom:solar-forecast-card" };
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this.refreshTimer = window.setInterval(() => this.refresh(), REFRESH_MS);
    document.addEventListener("click", this.onOutsideClick, true);
    document.addEventListener("keydown", this.onKeyDown);
    this.refresh();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.refreshTimer) window.clearInterval(this.refreshTimer);
    if (this.warningTimer) window.clearTimeout(this.warningTimer);
    document.removeEventListener("click", this.onOutsideClick, true);
    document.removeEventListener("keydown", this.onKeyDown);
    this.requestGeneration += 1;
  }

  protected updated(changed: PropertyValues): void {
    if (!changed.has("hass") || !this.hass) return;
    // Home Assistant replaces `hass` on every state change in the whole system.
    // Rebuilding the model for an unrelated entity would waste work on every update.
    if (this.model && this.stateSignature(this.hass) === this.watchedSignature) return;
    this.refresh();
  }

  /** The states of every entity this card actually reads. */
  private stateSignature(hass: HassLike): string {
    return [hass.config.time_zone]
      .concat(
        this.watchedEntityIds.map((entityId) => {
          const entity = hass.states[entityId];
          return `${entityId}=${entity?.state ?? ""};${entity?.attributes?.unit_of_measurement ?? ""};${entity?.last_updated ?? ""};${entity?.last_changed ?? ""};${entity?.last_reported ?? ""}`;
        }),
      )
      .join("|");
  }

  private watchEntities(hass: HassLike, payload: ForecastPayload): void {
    const ids = new Set<string>();
    if (this.config.production_today_entity) ids.add(this.config.production_today_entity);
    for (const source of payload.sources) {
      if (source.remainingEntityId) ids.add(source.remainingEntityId);
      if (source.tomorrowEntityId) ids.add(source.tomorrowEntityId);
    }
    this.watchedEntityIds = [...ids].sort();
    this.watchedSignature = this.stateSignature(hass);
  }

  /** The language the user selected in Home Assistant, before any browser setting. */
  private userLanguage(): string | undefined {
    return this.hass?.locale?.language || this.hass?.language || undefined;
  }

  private language(): string {
    return resolveLocale(this.config.language, this.userLanguage());
  }

  private text(key: Parameters<typeof localize>[0]): string {
    return localize(key, this.config.language, this.userLanguage());
  }

  private async refresh(): Promise<void> {
    const hass = this.hass;
    if (!hass || !this.isConnected) return;
    const generation = ++this.requestGeneration;
    try {
      const payload = await loadForecastData(hass);
      if (generation !== this.requestGeneration || hass !== this.hass) return;
      this.model = buildViewModel(hass, this.config, payload, new Date());
      this.watchEntities(hass, payload);
      this.syncWarningDelay();
    } catch {
      if (generation !== this.requestGeneration || hass !== this.hass) return;
      this.model = undefined;
      this.watchedEntityIds = [];
      this.watchedSignature = undefined;
      this.syncWarningDelay();
    }
  }

  private syncWarningDelay(): void {
    const now = Date.now();
    const issues = this.currentIssues();
    const immediate = issues.filter(
      (issue) => (issue as DataIssue & { immediate?: boolean }).immediate === true,
    );
    this.warningTracker.update(
      issues.filter((issue) => !immediate.includes(issue)),
      now,
    );
    this.immediateIssues = immediate;
    const active = [...immediate, ...this.warningTracker.active(now)];
    const activeSignature = active.map((issue) => issue.key).join("|");
    this.warningVisible = active.length > 0;
    if (activeSignature !== this.activeWarningSignature) {
      this.activeWarningSignature = activeSignature;
      this.requestUpdate();
    }
    if (this.warningTimer) window.clearTimeout(this.warningTimer);
    const deadline = this.warningTracker.nextDeadline();
    if (deadline && deadline > now)
      this.warningTimer = window.setTimeout(() => this.syncWarningDelay(), deadline - now + 1);
  }

  private formatEnergy(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "—";
    return new Intl.NumberFormat(this.language(), {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    }).format(value);
  }

  private formatDate(day: DailyForecast): string {
    return new Intl.DateTimeFormat(this.language(), {
      day: "2-digit",
      month: "2-digit",
      timeZone: "UTC",
    }).format(new Date(`${day.dateKey}T12:00:00Z`));
  }

  private weekday(day: DailyForecast): string {
    if (day.isToday) return this.text("today");
    const today = this.model?.days.find((candidate) => candidate.isToday)?.dateKey;
    const tomorrow = today ? new Date(`${today}T12:00:00Z`) : undefined;
    if (tomorrow) tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    if (tomorrow?.toISOString().slice(0, 10) === day.dateKey) return this.text("tomorrow");
    return new Intl.DateTimeFormat(this.language(), { weekday: "short", timeZone: "UTC" }).format(
      new Date(`${day.dateKey}T12:00:00Z`),
    );
  }

  private toggleTooltip(event: Event, id: string): void {
    event.stopPropagation();
    if (this.pinnedTooltip === id) {
      this.pinnedTooltip = undefined;
      this.hoveredTooltip = undefined;
      return;
    }
    this.pinnedTooltip = id;
  }

  private openOnFocus(id: string): void {
    this.hoveredTooltip = id;
  }

  private closeOnLeave(id: string): void {
    if (this.pinnedTooltip !== id) this.hoveredTooltip = undefined;
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      this.pinnedTooltip = undefined;
      this.hoveredTooltip = undefined;
    }
  };

  private onOutsideClick = (event: Event): void => {
    if (!this.contains(event.target as Node)) {
      this.pinnedTooltip = undefined;
      this.hoveredTooltip = undefined;
    }
  };

  private dayTooltip(day: DailyForecast): string {
    const forecast = `${this.text("forecast")}: ${this.formatEnergy(day.forecastKwh)} kWh`;
    const production =
      day.isToday && day.productionKwh != null
        ? `\n${this.text("produced")}: ${this.formatEnergy(day.productionKwh)} kWh`
        : "";
    const missing =
      day.isToday && this.config.production_today_entity && day.productionKwh == null
        ? `\n${this.text("productionMissing")}`
        : "";
    const omitted =
      day.isToday && !this.config.production_today_entity
        ? `\n${this.text("productionNotConfigured")}`
        : "";
    const percentage =
      day.isToday && day.productionKwh != null && (day.totalKwh ?? 0) > 0
        ? `\n${this.text("productionPercent").replace("{percent}", this.formatEnergy((day.productionKwh / (day.totalKwh ?? 1)) * 100))}`
        : "";
    const sources =
      day.sourceCount < day.expectedSourceCount
        ? `\n${this.text("sourcesPartial")
            .replace("{count}", String(day.sourceCount))
            .replace("{total}", String(day.expectedSourceCount))}`
        : "";
    const truncated = day.partial ? `\n${this.text("dayPartial")}` : "";
    return `${this.text("total")}: ${this.formatEnergy(day.totalKwh)} kWh${production}${percentage}\n${forecast}${missing}${omitted}${sources}${truncated}`;
  }

  private issueText(): VisibleIssue[] {
    const all = [...this.immediateIssues, ...this.warningTracker.active()];
    if (!this.model && all.length === 0) return [];
    return all.map((issue) => ({
      key: issue.key,
      text: `${this.issueMessage(issue.code, issue.key)}${issue.entityId || issue.sourceId ? ` (${issue.entityId || issue.sourceId})` : ""}`,
    }));
  }

  private currentIssues(): DataIssue[] {
    const issues = this.model?.issues || [{ key: "load", code: "forecast_unavailable" as const }];
    const requested = this.config.language?.toLowerCase();
    const resolved = requested ? resolveLocale(requested) : undefined;
    if (requested && resolved && requested !== resolved && requested.split("-")[0] !== resolved) {
      return [...issues, { key: "config:language", code: "forecast_incomplete" }];
    }
    return issues;
  }

  private issueMessage(code: DataIssue["code"], key?: string): string {
    if (key === "config:language") return this.text("invalidLanguage");
    switch (code) {
      case "connection_unavailable":
      case "forecast_unavailable":
        return code === "connection_unavailable"
          ? this.text("warningConnection")
          : this.text("warningForecast");
      case "source_discovery_failed":
        return this.text("warningSources");
      case "forecast_incomplete":
        return this.text("warningIncomplete");
      case "invalid_energy":
        return this.text("warningEnergy");
      case "production_invalid":
        return this.text("warningProduction");
      case "forecast_schema_invalid":
        return this.text("warningSchema");
      default:
        return this.text("incomplete");
    }
  }

  private isTooltipOpen(id: string): boolean {
    return this.pinnedTooltip === id || this.hoveredTooltip === id;
  }

  private renderTooltip(id: string, text: string) {
    return html`<span
      id="tooltip-${id}"
      class="tooltip"
      role="tooltip"
      ?hidden=${!this.isTooltipOpen(id)}
      >${text}</span
    >`;
  }

  private renderDay(day: DailyForecast) {
    const total = Math.max(day.totalKwh ?? 0, 0);
    const max = this.model?.maxKwh ?? 0;
    const height = max > 0 ? Math.min(100, (total / max) * 100) : 0;
    const produced =
      day.isToday && day.productionKwh != null && max > 0
        ? Math.min(height, Math.max(0, (day.productionKwh / max) * 100))
        : 0;
    const id = `day-${day.dateKey}`;
    return html` <article class="day ${day.isToday ? "is-today" : ""}">
      <button
        class="day-button"
        data-tooltip-trigger
        aria-describedby="tooltip-${id}"
        aria-label="${this.weekday(day)}. ${this.dayTooltip(day)}"
        @click=${(event: Event) => this.toggleTooltip(event, id)}
        @focus=${() => this.openOnFocus(id)}
        @blur=${() => this.closeOnLeave(id)}
        @mouseenter=${() => this.openOnFocus(id)}
        @mouseleave=${() => this.closeOnLeave(id)}
      >
        <strong>${this.formatEnergy(day.totalKwh)}</strong><span class="unit">kWh</span>
        <span class="track ${day.complete ? "" : "is-incomplete"}" aria-hidden="true">
          <span
            class="fill ${day.isToday ? "today-fill" : "future-fill"}"
            style="height:${height}%"
          ></span>
          ${day.isToday && produced > 0
            ? html`<span class="produced" style="height:${produced}%"></span>`
            : nothing}
        </span>
        <span class="weekday">${this.weekday(day)}</span>
        <span class="date">${this.formatDate(day)}</span>
        ${this.renderTooltip(id, this.dayTooltip(day))}
      </button>
    </article>`;
  }

  protected render() {
    const model = this.model;
    const headerId = "summary";
    const warningId = "warning";
    const issues = this.issueText();
    // The total is marked, never hidden, when it cannot cover every displayed day.
    const marker = model && !model.periodComplete ? this.text("approximate") : "";
    const totalHeader = `${this.text("period")}: ${marker}${this.formatEnergy(model?.periodKwh)} kWh | ${this.text("average")}: ${marker}${this.formatEnergy(model?.averageKwh)} kWh${this.text("perDay")}`;
    // The tooltip explains the numbers instead of repeating them.
    const summaryTooltip = [
      this.text("periodHelp"),
      model && !model.periodComplete ? this.text("periodIncomplete") : "",
      !this.config.production_today_entity ? this.text("periodRestOnly") : "",
    ]
      .filter(Boolean)
      .join("\n");
    return html` <ha-card>
      <section class="card" aria-label="${this.config.name || this.text("title")}">
        <header>
          <div class="title">
            <ha-icon class="sun" icon="mdi:solar-power" aria-hidden="true"></ha-icon>
            <h1>${this.config.name || this.text("title")}</h1>
          </div>
          <div class="summary-wrap">
            <button
              class="remaining"
              data-tooltip-trigger
              aria-describedby="tooltip-${headerId}"
              @click=${(event: Event) => this.toggleTooltip(event, headerId)}
              @focus=${() => this.openOnFocus(headerId)}
              @blur=${() => this.closeOnLeave(headerId)}
              @mouseenter=${() => this.openOnFocus(headerId)}
              @mouseleave=${() => this.closeOnLeave(headerId)}
              aria-label="${this.text("remaining")}: ${this.formatEnergy(
                model?.remainingKwh,
              )} kWh. ${totalHeader}. ${summaryTooltip}"
            >
              <b>${this.text("remaining")}:</b> ${this.formatEnergy(model?.remainingKwh)} kWh
            </button>
            ${this.renderTooltip(headerId, summaryTooltip)}
            <p>${totalHeader}</p>
          </div>
          <div class="warning-slot">
            ${this.warningVisible
              ? html`<button
                    class="warning"
                    data-tooltip-trigger
                    aria-describedby="tooltip-${warningId}"
                    aria-label="${this.text("warning")}"
                    @click=${(event: Event) => this.toggleTooltip(event, warningId)}
                    @focus=${() => this.openOnFocus(warningId)}
                    @blur=${() => this.closeOnLeave(warningId)}
                    @mouseenter=${() => this.openOnFocus(warningId)}
                    @mouseleave=${() => this.closeOnLeave(warningId)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 3 1 21h22L12 3Zm1 15h-2v-2h2v2Zm0-4h-2v-4h2v4Z" />
                    </svg></button
                  >${this.renderTooltip(warningId, issues.map((issue) => issue.text).join("\n"))}`
              : nothing}
          </div>
        </header>
        <main class="chart" style=${`--day-count:${model?.days?.length || 1}`}>
          ${model?.days?.length
            ? model.days.map((day) => this.renderDay(day))
            : html`<p class="empty">${this.text("noForecast")}</p>`}
        </main>
      </section>
    </ha-card>`;
  }

  static styles = css`
    :host,
    ha-card,
    .card {
      height: 100%;
    }
    :host {
      display: block;
      container-type: inline-size;
      --forecast-yellow: #ffd95a;
      --forecast-orange: #ff9e0b;
    }
    ha-card {
      box-sizing: border-box;
      overflow: visible;
      border: 1px solid var(--divider-color, #dedede);
      border-radius: 24px;
      background: var(--ha-card-background, var(--card-background-color, #fff));
      color: var(--primary-text-color, #1a1a1a);
      box-shadow: none;
    }
    .card {
      box-sizing: border-box;
      min-height: 0;
      padding: 28px 24px 20px;
      position: relative;
      display: grid;
      grid-template-rows: 58px minmax(0, 1fr);
      gap: 10px;
    }
    header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto 26px;
      gap: 8px;
      align-items: start;
    }
    .title {
      display: flex;
      align-items: center;
      gap: 13px;
      min-width: 0;
    }
    .sun {
      display: block;
      color: var(--forecast-orange);
      width: 24px;
      height: 24px;
      flex: 0 0 24px;
    }
    h1 {
      margin: 0;
      font-size: 1.1em;
      font-weight: 600;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .summary-wrap {
      position: relative;
      text-align: right;
      color: var(--secondary-text-color, #757575);
      font-size: clamp(10px, 2.15cqw, 16px);
      min-width: 0;
      max-width: min(60cqw, 430px);
    }
    .remaining {
      appearance: none;
      border: 0;
      padding: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .remaining b {
      color: var(--forecast-orange);
    }
    .summary-wrap p {
      margin: 8px 0 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .warning-slot {
      width: 26px;
      min-height: 26px;
      position: relative;
    }
    .warning {
      color: var(--forecast-orange);
      border: 0;
      background: transparent;
      padding: 1px;
      cursor: pointer;
    }
    .warning svg {
      display: block;
      width: 21px;
      height: 21px;
      fill: currentColor;
    }
    .tooltip {
      white-space: pre-line;
      position: absolute;
      z-index: 5;
      right: 0;
      top: calc(100% + 7px);
      min-width: 170px;
      max-width: 260px;
      padding: 9px 11px;
      border-radius: 8px;
      background: var(--primary-text-color, #222);
      color: var(--card-background-color, #fff);
      font-size: 12px;
      line-height: 1.35;
      text-align: left;
      box-shadow: 0 2px 8px #0004;
    }
    .tooltip[hidden] {
      display: none;
    }
    .day:first-child .tooltip {
      left: 0;
      right: auto;
    }
    .day:last-child .tooltip {
      left: auto;
      right: 0;
    }
    .chart {
      min-height: 0;
      display: grid;
      grid-template-columns: repeat(var(--day-count, 5), minmax(44px, 1fr));
      align-items: stretch;
      gap: 10px;
    }
    .day {
      min-width: 0;
      display: flex;
      justify-content: center;
    }
    .day.is-today {
      background: color-mix(in srgb, var(--forecast-yellow) 17%, transparent);
      border-radius: 22px;
    }
    .day-button {
      border: 0;
      color: inherit;
      background: transparent;
      font: inherit;
      width: 100%;
      padding: 12px 3px 0;
      min-height: 0;
      display: grid;
      grid-template-rows: 23px 17px minmax(0, 1fr) 23px 20px;
      justify-items: center;
      position: relative;
      cursor: pointer;
    }
    .day-button strong {
      font-size: clamp(14px, 2.8cqw, 20px);
      line-height: 23px;
      white-space: nowrap;
    }
    .unit {
      color: var(--secondary-text-color, #777);
      font-size: 14px;
      white-space: nowrap;
    }
    .track {
      align-self: end;
      position: relative;
      width: 48px;
      max-width: 72%;
      height: max(32px, calc(100% - 8px));
      margin-top: 8px;
      overflow: hidden;
      border-radius: 15px 15px 6px 6px;
      background: color-mix(in srgb, var(--secondary-text-color, #999) 20%, transparent);
    }
    .track.is-incomplete {
      outline: 2px dashed var(--forecast-orange);
      outline-offset: 2px;
    }
    .fill,
    .produced {
      bottom: 0;
      left: 0;
      right: 0;
      position: absolute;
      border-radius: 12px 12px 5px 5px;
    }
    .future-fill {
      background: linear-gradient(to top, var(--forecast-orange), var(--forecast-yellow));
      box-shadow: 0 0 15px color-mix(in srgb, var(--forecast-yellow) 50%, transparent);
    }
    .today-fill {
      background: var(--forecast-yellow);
      box-shadow: 0 0 15px color-mix(in srgb, var(--forecast-yellow) 50%, transparent);
    }
    .produced {
      background: var(--forecast-orange);
      box-shadow: none;
    }
    .weekday {
      align-self: end;
      margin-top: 7px;
      font-size: 17px;
      font-weight: 700;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .is-today .weekday {
      color: var(--forecast-orange);
    }
    .date {
      color: var(--secondary-text-color, #777);
      font-size: 14px;
      white-space: nowrap;
    }
    .empty {
      grid-column: 1 / -1;
      align-self: center;
      text-align: center;
      color: var(--secondary-text-color, #777);
    }
    button:focus-visible {
      outline: 2px solid var(--primary-color, #03a9f4);
      outline-offset: 3px;
      border-radius: 6px;
    }
    @container (max-width: 500px) {
      .card {
        padding: 20px 12px 16px;
      }
      h1 {
        font-size: 1.1em;
      }
      .chart {
        gap: 2px;
      }
      .track {
        width: 39px;
      }
      .weekday {
        font-size: clamp(11px, 3.3cqw, 14px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      * {
        transition: none !important;
        animation: none !important;
      }
    }
  `;
}

declare global {
  interface Window {
    customCards?: Array<{ type: string; name: string; description: string }>;
  }
}

if (!customElements.get("solar-forecast-card"))
  customElements.define("solar-forecast-card", SolarForecastCard);

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "solar-forecast-card")) {
  window.customCards.push({
    type: "solar-forecast-card",
    name: "Solar Forecast Card",
    description: "Combined Forecast.Solar dashboard card",
  });
}
