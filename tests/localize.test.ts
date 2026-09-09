import { describe, expect, it } from "vitest";
import { localize, resolveLocale, supportedLocales } from "../src/localize";

describe("localization", () => {
  it("uses an exact locale before its base locale", () => {
    expect(resolveLocale(undefined, "de-DE")).toBe("de");
    expect(resolveLocale("de", "en-US")).toBe("de");
  });

  it("falls back to English for unsupported locales", () => {
    expect(resolveLocale("fr-CA", "de-DE")).toBe("en");
    expect(localize("title", "fr-CA", "de-DE")).toBe("Solar forecast");
  });

  it("keeps locale definitions discoverable for the editor", () => {
    expect(Object.keys(supportedLocales())).toEqual(expect.arrayContaining(["en", "de"]));
    expect(localize("remaining", "de")).toBe("REST");
  });
});
