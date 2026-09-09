# Release process

The project does not release source changes automatically.
The current source version is `0.1.0`.
The approved first release is `v0.1.0`.

Before a later release, propose the exact version.
Wait for explicit approval for that version.

The release process runs automated unit and integration checks.
It does not start, test, or change a Home Assistant instance.
It does not run browser or Playwright checks.
It does not run token-intensive, time-intensive, or resource-intensive tests.
Controlled API fixtures cover service responses and source discovery behavior.
See [release verification](release-verification.md) for the exact scope.

After approval, the release process will:

1. Set the approved version in every shipped version file.
2. Run the agreed format, lint, type, test, and build checks.
3. Check README examples against the finished card.
4. Write English changelog entries from the user's view.
5. Build `dist/solar_forecast.js`.
6. Complete the final review.
7. Create the release commit and matching Git tag.
8. Push the approved commit and tag.
9. Publish the GitHub release with checked Markdown release notes.
10. Verify the tag, release asset, and clean Git status.

The tag and GitHub release title will match exactly.
For example, both will use `v0.1.0`.

The changelog will contain one user-visible change per bullet.
It will use simple English.
The changelog changes for an approved release.

Published tags will never move.
A later fix will use a new version.
