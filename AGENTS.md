<!-- CODEX_SOFTWARE_TEAM:ENABLED -->

# Project rules

Use `PLAN.md` for the agreed product scope. Preserve existing user changes.
Use an architect before substantial source changes. Delegate implementation to developer agents.
Keep parallel write scopes separate. Agents must not revert each other's work.

## Release rules

- Create releases only when the user explicitly requests a release.
- Propose the exact next version before any push. Wait for approval unless already approved for that release.
- Never start, test, or change a Home Assistant container or an existing Home Assistant instance for this project.
- Never run Playwright or browser checks for this project.
- Run automated unit or integration tests only directly before an approved release.
- Do not run token-intensive, time-intensive, or resource-intensive tests.
- Run changelog updates, commits, tags, pushes, and publication only for an approved release.
- A separate explicit test request permits only the requested checks.
- Do not run HACS validation unless the user explicitly requests it.
- Do not add automatic push or pull-request validation workflows.
- Use the test runner only for the agreed automated release checks.
- Read-only source review during implementation is allowed. It is not release approval.
- Use the exact tag as the GitHub release title, for example `v0.1.0`.
- Keep package, lockfile, and shipped version values consistent.
- Write English changelog bullets from the user's view. Put one change in each bullet.
- Check README, configuration examples, and screenshots against the released behavior.
- Use a temporary Markdown file for release notes and `gh release create --notes-file`.
- Use real line breaks. Check the release notes before publication.
- Verify the tag, release assets, and clean Git status after publication.
- Never move published tags or overwrite user changes.

## Product rules

- Discover and sum all enabled Forecast.Solar entries. Do not ask users to select forecast sources.
- Count each entry once. Do not add its individual planes to its already combined forecast.
- Missing energy is not zero. Do not present partial sums as complete forecasts.
- Keep card dimensions stable when the number of days changes.
- Show at most today and four future days.
- Delay each warning triangle until its error has lasted three continuous minutes.
- Show confirmed service schema errors immediately, as required by the updated plan.
- Explain warnings only on hover, focus, or click.
- Keep all user-facing strings in extensible locale files. Start with English and German.
- Use simple English for README, wiki pages, changelogs, release notes, and public guides.
- Write README text using ASD-STE100 Simplified Technical English rules and consistent technical terms.
- Preserve the latest PLAN.md changes: Home Assistant language before browser language, marked partial days, and visible partial totals.
- Do not show a version badge in the card.
- Verify service behavior with automated tests and controlled Home Assistant API fixtures.
- Do not call Forecast.Solar directly or request API keys in the card.
- Do not commit secrets or production data.
