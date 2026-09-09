# Solar Forecast Card

Solar Forecast Card is a Home Assistant dashboard card.
It displays combined Forecast.Solar energy forecasts.

## Status

The release version is `0.1.0`.
The card does not display a version badge.
The project has no approved screenshots.

The target Home Assistant version is 2026.9.1.
The project uses automated checks before a release.
The project does not start, test, or change a Home Assistant instance.
The project does not run browser or Playwright checks.

The implementation uses `forecast_solar.get_forecast`.
The automated checks use controlled Home Assistant API fixtures.
The checks cover service responses and source discovery behavior.
The checks do not use production data or the Forecast.Solar network service.
See [release verification](docs/release-verification.md) for the test scope.

## Card display

The card displays five days at most.
The display period contains today and four future days at most.
The card keeps a fixed card size when the day count changes.

The highest complete daily value sets the bar scale.
Future-day bars use a yellow-to-orange gradient.
Today uses orange for produced energy.
Today uses yellow for remaining forecast energy.

Set an optional production sensor to show produced energy for today.
The sensor must measure the total energy from all displayed solar systems.
Without this sensor, the card displays only the remaining forecast for today.

The forecast provider can return a truncated last day.
The card displays a truncated day with a dashed bar outline.
The card keeps the truncated day visible.
The card excludes the truncated day from the total, average, and bar scale.
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
The user does not select forecast sources.

Home Assistant 2026.9.1 provides `forecast_solar.get_forecast` in its source code.
This service does not require Energy dashboard forecast mappings.
Older Home Assistant versions can use a limited fallback.
See [data sources](docs/data-sources.md) for source and fallback details.

## Configuration

Use this configuration for the card:

```yaml
type: custom:solar-forecast-card
```

Set `production_today_entity` to display produced energy for today:

```yaml
type: custom:solar-forecast-card
production_today_entity: sensor.solar_energy_today
```

The sensor must use an energy unit.
Use Wh, kWh, or MWh.
Do not use a power sensor with W or kW.

Set `language` to select a card language:

```yaml
type: custom:solar-forecast-card
language: de
```

The card supports English and German.
The card first uses the configured `language` value.
Without that value, the card uses the Home Assistant language.
Without a Home Assistant language, the card uses the browser language.
Without a supported language, the card uses English.

The visual editor provides the same configuration fields.
See [translations](docs/translations.md) to add a language.

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

## Local installation

Download `solar_forecast.js` from the GitHub release.
You can also create the file with a local build.

1. Copy `solar_forecast.js` to `/config/www/solar_forecast/solar_forecast.js`.
2. Add the dashboard resource below.

```yaml
url: /local/solar_forecast/solar_forecast.js
type: module
```

## HACS installation

The HACS user interface calls this repository type **Dashboard**.
The HACS backend calls this repository type `plugin`.

1. Open **Custom repositories** in HACS.
2. Add `yas4891/solar_forecast` as a repository.
3. Select **Dashboard** as the repository type.
4. Select **Add**.
5. Open **Solar Forecast Card** in HACS.
6. Select **Download**.

[Install Solar Forecast Card with HACS](https://my.home-assistant.io/redirect/hacs_repository/?owner=yas4891&repository=solar_forecast&category=plugin)

Install the card from the first public release.

## Development and releases

The approved first release is `v0.1.0`.

The project runs automated unit and integration checks only before a release.
The project does not run browser or Playwright checks.
The project does not start or change a Home Assistant instance.

See [release process](docs/releasing.md) for the release procedure.

## License

This project uses the [MIT License](LICENSE).
