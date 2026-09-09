# Solar Forecast Card

[![Latest release](https://img.shields.io/github/v/release/yas4891/solar_forecast?style=flat-square)](https://github.com/yas4891/solar_forecast/releases/latest)
[![HACS custom repository](https://img.shields.io/badge/HACS-Custom-orange.svg?style=flat-square)](https://hacs.xyz)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Validate](https://github.com/yas4891/solar_forecast/actions/workflows/manual-quality.yml/badge.svg)](https://github.com/yas4891/solar_forecast/actions/workflows/manual-quality.yml)

Solar Forecast Card is a Home Assistant dashboard card.
It displays combined Forecast.Solar energy forecasts.

## Installation

### HACS installation

This repository is available as a HACS custom repository.

[![Open this repository in your Home Assistant instance](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=yas4891&repository=solar_forecast&category=plugin)

1. Select the button above on a device that can open Home Assistant.
2. Confirm the custom repository as type **Dashboard**.
3. Open HACS and select **Solar Forecast Card**.
4. Select **Download**.
5. Reload the browser when HACS finishes.
6. Add the card through the dashboard editor.

HACS usually registers the dashboard resource automatically.
Add this resource manually only when Home Assistant does not load the card:

```yaml
url: /hacsfiles/solar_forecast/solar_forecast.js
type: module
```

### Local installation

1. Download `solar_forecast.js` from the [latest release](https://github.com/yas4891/solar_forecast/releases/latest).
2. Copy it to `/config/www/solar_forecast/solar_forecast.js`.
3. Register this Home Assistant dashboard resource:

```yaml
url: /local/solar_forecast/solar_forecast.js
type: module
```

4. Reload the browser.
5. Add `custom:solar-forecast-card` through the dashboard editor.

## Configuration

Use this configuration for the card:

```yaml
type: custom:solar-forecast-card
```

The card finds all enabled Forecast.Solar entries automatically.
You do not select forecast sources.

Set `production_today_entity` to show produced energy for today:

```yaml
type: custom:solar-forecast-card
production_today_entity: sensor.solar_energy_today
```

The sensor must measure the total energy from all displayed solar systems.
The sensor must use Wh, kWh, or MWh.
Do not use a power sensor with W or kW.

Set `language` to select a card language:

```yaml
type: custom:solar-forecast-card
language: de
```

The card supports English and German.
The configured `language` value has first priority.
Home Assistant supplies the language when this value is not set.
The browser supplies the language when Home Assistant reports no language.
The card uses English when no supported language is available.

The visual editor provides the same configuration fields.
See [translations](docs/translations.md) to add a language.

## Card display

The card displays five days at most.
The display period contains today and four future days at most.
The card keeps a fixed card size when the day count changes.
Use the Home Assistant layout editor to set the card height.
The card uses eight grid rows by default.
The layout editor allows at least four grid rows.

The highest complete daily value sets the bar scale.
Future-day bars use a yellow-to-orange gradient.
Today uses orange for produced energy.
Today uses yellow for remaining forecast energy.

Without a production sensor, the card displays only today's remaining forecast.

The forecast provider can return a truncated last day.
The card displays this day with a dashed bar outline.
The card excludes this day from the total, average, and bar scale.
The card marks the total as a subtotal.
The total tooltip explains the excluded day.

The card does not treat missing energy as zero.
The card does not show a partial forecast as a complete forecast.
The card does not extend a forecast with calculated values.

## Forecast sources

The card uses the Home Assistant Forecast.Solar integration.
The card does not call the Forecast.Solar web service directly.
The card does not require an API key, location, or panel data.

The card detects each enabled Forecast.Solar entry automatically.
The card counts each entry once.
The card does not count planes already combined by an entry.

Home Assistant 2026.9.1 provides `forecast_solar.get_forecast` in its source code.
This service does not require Energy dashboard forecast mappings.
Older Home Assistant versions can use a limited fallback.
See [data sources](docs/data-sources.md) for source and fallback details.

## Warnings

The card uses an orange warning triangle for a data error.
The triangle appears when the error continues for three minutes.
Hover over the triangle to open the warning text.
Focus the triangle to open the warning text.
Select the triangle to open the warning text.
The triangle disappears when the error ends.

An omitted production sensor is not a data error.
A service schema error shows the triangle immediately.
This error means that Home Assistant cannot accept the request or supply the expected response.

## Development and releases

The project runs automated unit and integration checks only before a release.
The project does not run browser or Playwright checks.
The project does not start or change a Home Assistant instance.

See [release process](docs/releasing.md) for the release procedure.

## License

This project uses the [MIT License](LICENSE).
