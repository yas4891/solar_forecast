const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/** Formatters are expensive to build, so each Home Assistant timezone keeps one. */
function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dateFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Returns a YYYY-MM-DD key in Home Assistant's configured IANA timezone. */
export function dateKeyAt(date: Date | number, timeZone: string): string {
  const parts = dateFormatter(timeZone).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function dateKeysFrom(now: Date | number, timeZone: string, count = 5): string[] {
  const first = new Date(dateKeyAt(now, timeZone) + "T12:00:00Z");
  return Array.from({ length: count }, (_, index) => {
    const next = new Date(first);
    next.setUTCDate(first.getUTCDate() + index);
    return next.toISOString().slice(0, 10);
  });
}
