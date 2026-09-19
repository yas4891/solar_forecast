# Architecture

Solar Forecast Card is a Home Assistant custom card.
Its card type is `custom:solar-forecast-card`.
The local build creates `dist/solar_forecast.js`.
The approved release is `v0.4.0`.

The implementation uses TypeScript, Lit, and Vite.
It keeps the card, data access, calculations, and locales separate.

```text
Home Assistant state and forecast services
                |
                v
 Provider selection and source aggregation
                |
                v
     Daily energy model and warning state
                |
                v
       Localized Solar Forecast Card view
```

The card uses Home Assistant data only.
It does not call Forecast.Solar or Solcast from the browser.
It does not handle API keys.

The card discovers sources through `config_entries/get`.
It supports `forecast_solar` and `solcast_solar`.
Automatic selection prefers Forecast.Solar when both integrations are available.
The card does not combine provider data.
It does not change the selected provider after a runtime error.
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
The checks do not call a forecast provider network service.
The card keeps a legacy fallback for older Home Assistant versions.

The first supported Solcast contract is `BJReplay/ha-solcast-solar` version `4.6.1`.
Solcast provides one combined total for its included sites.
The card treats this total as one source.
It uses `solcast_solar.query_forecast_data` with the configured forecast mode.
The mode can be `estimate`, `estimate10`, or `estimate90`.
The card reads cached Solcast data and never requests a provider update.
It never reads or stores a Solcast API key.

An optional historical comparison uses `history/history_during_period`.
It reads the forecast effective at local 19:00 and production before local midnight.
Local date functions resolve time changes and skipped dates without fixed UTC offsets.
The historical data cache expires at the next local day start.
