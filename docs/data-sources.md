# Data sources

Solar Forecast Card uses existing forecast integrations in Home Assistant.
It supports Forecast.Solar and Solcast PV Forecast from `BJReplay/ha-solcast-solar`.
The first supported Solcast contract is version `4.6.1`.
Older Solcast versions work only when they provide the same technical contract.

## Provider selection

Set `forecast_provider` to use one provider explicitly.

```yaml
type: custom:solar-forecast-card
forecast_provider: forecast_solar
```

Valid values are `forecast_solar` and `solcast_solar`.
Do not set `forecast_provider` to use automatic selection.

Automatic selection checks enabled Home Assistant configuration entries.
It selects Forecast.Solar when Forecast.Solar and Solcast are both available.
It selects Solcast when only Solcast is available.
It selects no provider when neither integration is available.
An enabled integration remains available when it is not loaded.

An explicit selection uses only the selected provider.
The card never combines data from Forecast.Solar and Solcast.
The card does not select the other provider after a runtime error.
If Forecast.Solar discovery fails during automatic selection, the card reports that discovery error.
It does not select Solcast without a confirmed Forecast.Solar result.

Each card can select its own provider.
For example, one card can use Forecast.Solar and another card can use Solcast.

## Forecast.Solar

Configure your Forecast.Solar systems in Home Assistant first.
The card finds all enabled Forecast.Solar entries automatically.
It uses `config_entries/get` as the authoritative source list.
It keeps entries that are not loaded in the expected source list.
It sums the combined value from each entry.
It counts every entry once.
It does not add planes that an entry already combines.

The entity registry maps each entry to its combined Forecast.Solar sensors.
The card does not ask users to choose sources.
It does not need another Forecast.Solar API key.

## Solcast

Configure Solcast PV Forecast in Home Assistant first.
The card supports the `solcast_solar` domain from `BJReplay/ha-solcast-solar` version `4.6.1`.
Solcast combines its included sites inside the integration.
The card treats this combined site total as one source.
It does not add individual site or diagnostic sensors.
Configure excluded sites in the Solcast integration.

The card uses the configured Solcast forecast mode.
The mode is `estimate`, `estimate10`, or `estimate90`.
The selected mode determines the returned forecast values.
The card updates the forecast when the configured mode changes.

The card first uses `solcast_solar.query_forecast_data`.
It uses the Solcast combined result without a site parameter.
It uses the dampening configured in Solcast.
The card reads Solcast cached data only.
It never starts a Solcast forecast update.
It never calls `update_forecasts` or `force_update_forecasts`.
It never calls `solcast_solar.get_options`.
The card never reads, stores, or requires an additional Solcast API key.

## Today

The card uses the combined remaining forecast for today.
It may also use an optional daily production energy sensor.

Set `production_today_entity` only when the sensor measures today's total solar energy.
Its value must include every system in the combined forecast.
The sensor must provide energy, such as Wh, kWh, or MWh.
It must not provide power, such as W or kW.

The sensor must cover the systems from the selected provider.
Check this requirement after you change `forecast_provider`.
The card cannot combine production from one provider with a forecast from different systems.

Without this sensor, the card shows only today's remaining forecast.
This is an expected configuration and does not show a warning.

## Yesterday comparison

Set `history_forecast_entity` with `production_today_entity` to enable the comparison.
The forecast entity must report the full energy forecast for the next day.
The production entity must reset each local day.
Both entities must cover every displayed solar system.

The card reads the forecast state effective at 19:00 two days earlier.
It reads the last production state before the following local midnight.
Home Assistant Recorder must retain these states.
The card shows yesterday only when both values are valid energy values.
It does not replace missing historical energy with zero.

## Future days

Home Assistant 2026.9.1 provides the `forecast_solar.get_forecast` service.
The card requests a forecast for every discovered enabled entry.
The service returns `{ context, response: { watts, wh_period } }`.
The card uses `wh_period` to calculate complete daily energy values.
This method does not need Forecast.Solar mappings in the Energy dashboard.

For Solcast, the card uses `solcast_solar.query_forecast_data` first.
Solcast returns average power in kW for half-hour intervals.
The card converts each valid interval to energy in kWh.
It groups intervals by the Home Assistant time zone.

Automated checks use controlled Home Assistant API fixtures for these interfaces.
The project does not start, test, or change a Home Assistant instance.
The checks do not call forecast provider network services.

The card shows at most today and four future days.
It only shows a future day when every expected entry provides a valid value.
Missing data never becomes zero.

The card counts the intervals behind each day.
It compares each day with the best covered day of the same series.
A day with far fewer intervals is a day cut short at the forecast horizon.
Such a day stays visible with a mark. It does not join the total, the average, or the scale.
The card never fills in the missing intervals from another day.

## Fallbacks

Older Home Assistant versions may not provide `forecast_solar.get_forecast`.
The card then tries the older `energy/solar_forecast` interface.
That interface needs Forecast.Solar mappings in the Energy dashboard.

If no usable time series exists, the card uses available sensors for today and tomorrow.
It does not invent additional future days.
It does not require selection of individual sources.

When `solcast_solar.query_forecast_data` is unavailable, the card can use `energy/solar_forecast`.
This Solcast fallback uses only the selected Solcast configuration entry.
It needs a matching Solcast mapping in the Energy dashboard.

Enabled Solcast daily sensors provide the final fallback.
The remaining-today sensor remains the source for today.
Daily sensors can provide tomorrow and later days when they are enabled.

A response schema error stops all fallbacks and shows a warning immediately.
Temporary provider errors follow the normal three-minute warning delay.
Stale data remains with its selected provider only.
The card never changes the provider after a runtime error.

## Incomplete data

The card does not present a partial sum as complete.
It keeps valid information visible when possible.
It shows an orange warning triangle after an error lasts three continuous minutes.
Warning details will appear on hover, focus, or click.
