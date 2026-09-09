# Architecture

Solar Forecast Card is a Home Assistant custom card.
Its card type is `custom:solar-forecast-card`.
The local build creates `dist/solar_forecast.js`.
The current release is `v0.2.0`.

The implementation uses TypeScript, Lit, and Vite.
It keeps the card, data access, calculations, and locales separate.

```text
Home Assistant state and forecast services
                |
                v
  Forecast.Solar entry discovery and data aggregation
                |
                v
     Daily energy model and warning state
                |
                v
       Localized Solar Forecast Card view
```

The card will use Home Assistant data only.
It will not call Forecast.Solar from the browser.
It will not handle API keys.

The card discovers sources through `config_entries/get` for the `forecast_solar` domain.
Controlled API fixtures cover source-discovery responses and authorization behavior.
Enabled entry IDs are the authoritative list of expected forecast sources.
An entry that is not loaded remains expected and creates a data issue.
This prevents a partial forecast from looking complete.

The entity registry maps each entry to its combined remaining and tomorrow sensors.
The card does not discover or add individual planes.

Home Assistant 2026.9.1 provides `forecast_solar.get_forecast` in its source code.
The card calls it for each discovered enabled entry.
The service response is `{ context, response: { watts, wh_period } }`.
The card aggregates complete daily energy values from `wh_period`.

Automated checks use controlled Home Assistant API fixtures for this interface.
The project does not start, test, or change a Home Assistant instance.
The checks do not call the Forecast.Solar network service.
The card keeps a legacy fallback for older Home Assistant versions.
