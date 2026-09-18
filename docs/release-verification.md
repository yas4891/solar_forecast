# Release verification

## v0.3.0 status

Release `v0.3.0` is approved and verified locally.

- `npm run format:check` passed.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed with 65 of 65 tests across 14 files.
- `npm run build` passed.
- `git diff --check` passed.

The release asset is `dist/solar_forecast.js`.
Its size is 71,136 bytes.
Its gzip size is 19.71 kB.
Its SHA-256 is `2b6618b7fbc62433a75e419dfd543c4cf3d8bae89aca4118d1e7dd91c0121332`.

No browser, Playwright, HACS, Home Assistant, or container check ran.
This document does not confirm a publication, commit, tag, or remote verification.

## v0.2.0 verification

Release `v0.2.0` used automated unit and integration checks.
The checks use controlled Home Assistant API fixtures.
The checks do not start, test, or change a Home Assistant instance.
The checks do not call the Forecast.Solar network service.
The checks do not provide production energy data.

The checks cover these actions:

- A fixture provides Forecast.Solar entries and registry mappings.
- A fixture provides service responses with `response.wh_period` values.
- Tests cover valid, incomplete, malformed, and unavailable forecast data.
- Tests cover source discovery behavior and error handling.

This release has no browser, Playwright, or visual verification.

## Automated checks

The format check passed after remediation.
The lint check passed.
The type check passed.
All 45 unit and integration tests passed across 11 test files.
The build check passed.
The Git diff check passed.
No Home Assistant container or instance ran.
No browser or Playwright check ran.
HACS validation did not run.

The release file is `solar_forecast.js`.
Its size is 58,627 bytes.
Its SHA-256 is `6af0f1b575051d27b8d9d360ef7195f8667faaf40ba39db6a735759aa6b4b1e3`.
