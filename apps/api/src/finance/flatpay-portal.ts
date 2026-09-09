export type FlatpayPortalDateRange = { from: string; to: string };

type ZonedDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zonedDateTimeParts(value: Date, timeZone: string): ZonedDateTime {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value ?? 0);
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
  };
}

function zonedInstant(parts: ZonedDateTime, timeZone: string) {
  const target = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let timestamp = target;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const observed = zonedDateTimeParts(new Date(timestamp), timeZone);
    const observedTimestamp = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    timestamp += target - observedTimestamp;
  }
  return new Date(timestamp);
}

function parseIsoDate(value: string) {
  const match = /^(20\d{2})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Date FlatPay invalide : ${value}.`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/**
 * FlatPay interprets the Orders URL instants in the account's local timezone.
 * Supplying UTC midnights therefore shifts the requested day for every account
 * east or west of UTC. Convert the local day boundaries to real UTC instants.
 */
export function flatpayOrdersQueryDates(
  range: FlatpayPortalDateRange,
  timeZone = process.env.FLATPAY_TIME_ZONE || process.env.TZ || 'Europe/Helsinki',
) {
  const from = parseIsoDate(range.from);
  const to = parseIsoDate(range.to);
  return {
    fromDate: zonedInstant({ ...from, hour: 0, minute: 0, second: 0 }, timeZone).toISOString(),
    toDate: zonedInstant({ ...to, hour: 23, minute: 59, second: 59 }, timeZone).toISOString(),
  };
}

export function isRecoverableFlatpayBrowserError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:target page|browser context|browser has been closed|context closed|page closed|crash|singletonlock|user data directory|profile.*(?:corrupt|locked|in use)|failed to launch)/i.test(
    message,
  );
}
