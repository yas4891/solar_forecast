import "../src/solar-forecast-card";
import { createFixtureHass, type FixtureScenario } from "../tests/fixtures/home-assistant";
import type { CardConfig, HassLike } from "../src/types";

interface CardElement extends HTMLElement {
  hass?: HassLike;
  setConfig(config: CardConfig): void;
}

const host = document.querySelector<HTMLElement>("#card-host");
if (!host) throw new Error("Fixture card host is missing");
const cardHost = host;

let scenario: FixtureScenario = "five-days";

function showFixture(nextScenario: FixtureScenario): void {
  scenario = nextScenario;
  const card = document.createElement("solar-forecast-card") as CardElement;
  card.hass = createFixtureHass(scenario);
  card.setConfig({
    type: "custom:solar-forecast-card",
    language: "en",
    ...(scenario === "no-production" ? {} : { production_today_entity: "sensor.production_today" }),
  });
  cardHost.replaceChildren(card);
}

document.querySelectorAll<HTMLButtonElement>("[data-fixture]").forEach((button) => {
  button.addEventListener("click", () => showFixture(button.dataset.fixture as FixtureScenario));
});

showFixture(scenario);
