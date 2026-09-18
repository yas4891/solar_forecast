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

/** Returns a date key offset by a number of local calendar days. */
export function dateKeyOffset(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localParts(date: Date | number, timeZone: string): Record<string, number> {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
}

/**
 * Finds the first UTC instant of a local calendar date. The coarse hourly search
 * brackets the change, then a binary millisecond search finds its exact boundary.
 */
export function localDayStart(dateKey: string, timeZone: string): number | undefined {
  const [year, month, day] = dateKey.split("-").map(Number);
  const center = Date.UTC(year, month - 1, day, 12);
  const searchStart = center - 48 * 60 * 60 * 1000;
  const searchEnd = center + 48 * 60 * 60 * 1000;
  const step = 60 * 60 * 1000;
  for (let instant = searchStart; instant <= searchEnd; instant += step) {
    if (dateKeyAt(instant, timeZone) !== dateKey) continue;
    let low = Math.max(searchStart, instant - step);
    let high = instant;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (dateKeyAt(middle, timeZone) < dateKey) low = middle + 1;
      else high = middle;
    }
    return dateKeyAt(low, timeZone) === dateKey ? low : undefined;
  }
  return undefined;
}

/** Finds the first UTC instant after a local calendar date, even across skipped dates. */
export function localDayEnd(dateKey: string, timeZone: string): number | undefined {
  const start = localDayStart(dateKey, timeZone);
  if (start === undefined) return undefined;
  const step = 60 * 60 * 1000;
  const searchEnd = start + 72 * step;
  for (let instant = start + step; instant <= searchEnd; instant += step) {
    if (dateKeyAt(instant, timeZone) === dateKey) continue;
    let low = instant - step;
    let high = instant;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (dateKeyAt(middle, timeZone) === dateKey) low = middle + 1;
      else high = middle;
    }
    return dateKeyAt(low, timeZone) === dateKey ? undefined : low;
  }
  return undefined;
}

/**
 * Resolves a local wall-clock time to every valid UTC instant in its local day.
 * A skipped time returns no candidates. A repeated time returns two candidates.
 */
export function resolveLocalDateTime(
  dateKey: string,
  hour: number,
  timeZone: string,
  minute = 0,
  second = 0,
  millisecond = 0,
): number[] {
  const start = localDayStart(dateKey, timeZone);
  const end = localDayEnd(dateKey, timeZone);
  if (start === undefined || end === undefined || end <= start) return [];
  const offsets = new Set<number>();
  const hourMs = 60 * 60 * 1000;
  for (let instant = start; instant < end; instant += hourMs) {
    offsets.add(localOffsetAt(instant, timeZone));
  }
  offsets.add(localOffsetAt(end - 1, timeZone));
  const [year, month, day] = dateKey.split("-").map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  return [...offsets]
    .map((offset) => wallClock - offset)
    .filter(
      (instant) =>
        instant >= start &&
        instant < end &&
        matchesLocalTime(instant, dateKey, hour, minute, second, millisecond, timeZone),
    )
    .sort((left, right) => left - right);
}

function localOffsetAt(instant: number, timeZone: string): number {
  const parts = localParts(instant, timeZone);
  return (
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
    instant +
    new Date(instant).getUTCMilliseconds()
  );
}

function matchesLocalTime(
  instant: number,
  dateKey: string,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  timeZone: string,
): boolean {
  const parts = localParts(instant, timeZone);
  return (
    dateKeyAt(instant, timeZone) === dateKey &&
    parts.hour === hour &&
    parts.minute === minute &&
    parts.second === second &&
    new Date(instant).getUTCMilliseconds() === millisecond
  );
}
