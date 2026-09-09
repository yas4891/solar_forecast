# Development

Install the locked packages with `npm ci --ignore-scripts`.

Run the local fixture with `npm run dev`.
Open the local URL shown by Vite.
The fixture has no connection to Home Assistant or Forecast.Solar.

The fixture has three fixed data scenarios.

- **Two forecast days** shows today and tomorrow.
- **Five forecast days** shows today and four future days.
- **No production sensor** leaves today's measured section empty.

The fixture responds to these Home Assistant WebSocket calls:

- `config_entries/get` with the Forecast.Solar domain.
- `config/entity_registry/list` for combined source sensors.
- `call_service` for the Forecast.Solar forecast response.
- `energy/solar_forecast` with an empty compatibility response.

Run automated unit and integration checks only directly before an approved release.
Run format, lint, type, and build checks in that release process.
Do not start, test, or change a Home Assistant instance.
Do not run browser or Playwright checks.
Do not run token-intensive, time-intensive, or resource-intensive tests.

HACS validation, commits, tags, pushes, and releases need separate approval.

Run the `HACS validation` workflow only when HACS validation is approved.
The workflow starts only with `workflow_dispatch`.
It runs `hacs/action@main` with the `plugin` category.
The workflow uses no secrets and runs no other checks.
