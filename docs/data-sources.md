# Data sources

Solar Forecast Card uses the existing Forecast.Solar integration in Home Assistant.
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

## Today

The card uses the combined remaining forecast for today.
It may also use an optional daily production energy sensor.

Set `production_today_entity` only when the sensor measures today's total solar energy.
Its value must include every system in the combined forecast.
The sensor must provide energy, such as Wh, kWh, or MWh.
It must not provide power, such as W or kW.

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

Automated checks use controlled Home Assistant API fixtures for this interface.
The project does not start, test, or change a Home Assistant instance.
The checks do not call the Forecast.Solar network service.

The card shows at most today and four future days.
It only shows a future day when every expected entry provides a valid value.
Missing data never becomes zero.

The card counts the intervals behind each day.
It compares each day with the best covered day of the same series.
A day with far fewer intervals is a day cut short at the forecast horizon.
Such a day stays visible with a mark. It does not join the total, the average, or the scale.
The card never fills in the missing intervals from another day.

## Older Home Assistant versions

Older Home Assistant versions may not provide `forecast_solar.get_forecast`.
The card then tries the older `energy/solar_forecast` interface.
That interface needs Forecast.Solar mappings in the Energy dashboard.

If no usable time series exists, the card uses available sensors for today and tomorrow.
It does not invent additional future days.
It keeps source selection out of the user configuration.

## Incomplete data

The card does not present a partial sum as complete.
It keeps valid information visible when possible.
It shows an orange warning triangle after an error lasts three continuous minutes.
Warning details will appear on hover, focus, or click.
