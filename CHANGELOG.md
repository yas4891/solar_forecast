# Changelog

## Unreleased

## 0.4.0 - 2026-09-19

- Use Solcast PV Forecast as a forecast provider.
- Select Forecast.Solar or Solcast explicitly, or select a provider automatically.
- Prefer Forecast.Solar automatically when both providers are configured.
- Keep the selected provider after a runtime error.
- Use the configured Solcast forecast mode and combined forecasts for included sites.

## 0.3.0 - 2026-09-18

- Compare yesterday's generated energy with the forecast at 19:00.
- Configure the comparison with a daily production sensor and a next-day forecast sensor.
- Show yesterday's generated energy and forecast in one accessible bar.
- Scale forecast and generated energy values together.
- Keep the comparison safe across time changes and local day changes.
- See a simpler card header with the period total and daily average below the title.

## 0.2.0 - 2026-09-09

- Set the card height with the Home Assistant layout editor.
- Use the `mdi:solar-power` icon in the card header.
- Match the card title size to PV Payback Card.
- Show remaining energy and period values on the right side of the header.
- Keep header text on one line when space is available.

## 0.1.0 - 2026-09-09

- View combined Forecast.Solar energy forecasts for up to five days.
- See produced and remaining energy in the bar for today.
- Add an optional daily production energy sensor.
- Use English or German in the card and editor.
- See data warnings with accessible warning details.
- Install the card as a custom HACS Dashboard repository.
