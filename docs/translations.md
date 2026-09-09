# Translations

Solar Forecast Card supports English and German.
The card uses the selected `language` value when it exists.
Otherwise, it uses the language you selected in Home Assistant.
It uses the browser language when Home Assistant reports none.
It uses English when no supported language matches.

## Add a language

Add a locale file in `src/localize/`.
Use the same typed keys as `src/localize/en.ts`.
Add the locale code, name, and dictionary in `src/localize/index.ts`.

The shared `Dictionary` type requires every translation key.
The `translationKeys` list defines those shared keys.
The editor reads registered locales from the same registry.
The card logic does not need changes for a new language.

The card first tries the full language code.
It then tries the base language code.
For example, `de-AT` uses the German locale.
It uses English when a key is missing.

Use complete translated sentences for messages.
Do not join translated sentence fragments in the card code.
