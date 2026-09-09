# Release verification

Release `v0.1.0` uses automated unit and integration checks.
The checks use controlled Home Assistant API fixtures.
The checks do not start, test, or change a Home Assistant instance.
The checks do not call the Forecast.Solar network service.
The checks do not provide production energy data.

The checks cover these actions:

- A fixture provides Forecast.Solar entries and registry mappings.
- A fixture provides service responses with `response.wh_period` values.
- Tests cover valid, incomplete, malformed, and unavailable forecast data.
- Tests cover source discovery behavior and error handling.

This release has no browser or visual verification.

## Automated checks

All 43 unit tests passed across 11 test files.
Formatting, lint, type, and build checks passed.
The built ES module loaded in happy-dom.
The card and editor registered, and the card produced its initial render.
HACS validation did not run.

The release file is `solar_forecast.js`.
Its size is 58,365 bytes.
Its SHA-256 is `d9d12ae3c3a1af83c5ae2d62e323ba67ee991946cb52df0d7d3bbf5fae91ff43`.
