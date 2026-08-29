export type FlatpayHistoryRange = { from: string; to: string };

export type FlatpayHistoryDiscovery = {
  version: 1;
  nextTo: string;
  consecutiveEmptyDays: number;
  complete: boolean;
  earliestScanned?: string;
  earliestActivity?: string;
  completedAt?: string;
  completionReason?: 'EMPTY_ACTIVITY' | 'PORTAL_BOUNDARY';
  portalBoundary?: string;
};

export type FlatpayHistoryObservation = {
  range: FlatpayHistoryRange;
  revenueRows: number;
  productRows: number;
};

export const FLATPAY_HISTORY_DISCOVERY_VERSION = 1;
export const DEFAULT_FLATPAY_EMPTY_STOP_DAYS = 62;

const ISO_DATE = /^20\d{2}-\d{2}-\d{2}$/;

export function addIsoDays(value: string, days: number) {
  if (!ISO_DATE.test(value)) throw new Error(`Date FlatPay invalide : ${value}.`);
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function rangeDays(range: FlatpayHistoryRange) {
  return (
    Math.floor(
      (new Date(`${range.to}T12:00:00.000Z`).getTime() -
        new Date(`${range.from}T12:00:00.000Z`).getTime()) /
        86_400_000,
    ) + 1
  );
}

function earliestGeneratedOrderStart(generatedKeys: string[]) {
  return generatedKeys
    .map((key) => /^orders:(20\d{2}-\d{2}-\d{2}):20\d{2}-\d{2}-\d{2}$/.exec(key)?.[1])
    .filter((value): value is string => Boolean(value))
    .sort()[0];
}

export function createFlatpayHistoryDiscovery(generatedKeys: string[], anchor: string) {
  const earliestGenerated = earliestGeneratedOrderStart(generatedKeys);
  return {
    version: FLATPAY_HISTORY_DISCOVERY_VERSION,
    nextTo: earliestGenerated ? addIsoDays(earliestGenerated, -1) : anchor,
    consecutiveEmptyDays: 0,
    complete: false,
  } satisfies FlatpayHistoryDiscovery;
}

export function planFlatpayHistoryRanges(
  discovery: FlatpayHistoryDiscovery,
  count: number,
  chunkDays = 7,
) {
  if (discovery.complete || count < 1) return [];
  if (!Number.isInteger(chunkDays) || chunkDays < 1 || chunkDays > 7) {
    throw new Error('La taille des périodes FlatPay doit être comprise entre 1 et 7 jours.');
  }
  const ranges: FlatpayHistoryRange[] = [];
  let to = discovery.nextTo;
  for (let index = 0; index < count; index += 1) {
    const from = addIsoDays(to, -(chunkDays - 1));
    ranges.push({ from, to });
    to = addIsoDays(from, -1);
  }
  return ranges;
}

export function applyFlatpayHistoryObservations(
  discovery: FlatpayHistoryDiscovery,
  observations: FlatpayHistoryObservation[],
  emptyStopDays = DEFAULT_FLATPAY_EMPTY_STOP_DAYS,
) {
  const next = { ...discovery };
  for (const observation of observations) {
    if (next.complete || observation.range.to !== next.nextTo) break;
    const hasActivity = observation.revenueRows > 0 || observation.productRows > 0;
    next.consecutiveEmptyDays = hasActivity
      ? 0
      : next.consecutiveEmptyDays + rangeDays(observation.range);
    next.earliestScanned = observation.range.from;
    if (hasActivity) next.earliestActivity = observation.range.from;
    next.nextTo = addIsoDays(observation.range.from, -1);
    if (next.consecutiveEmptyDays >= emptyStopDays) {
      next.complete = true;
      next.completionReason = 'EMPTY_ACTIVITY';
      next.completedAt = new Date().toISOString();
    }
  }
  return next;
}

export function completeFlatpayHistoryAtPortalBoundary(
  discovery: FlatpayHistoryDiscovery,
  boundary: string,
) {
  return {
    ...discovery,
    complete: true,
    completionReason: 'PORTAL_BOUNDARY' as const,
    portalBoundary: boundary,
    completedAt: new Date().toISOString(),
  };
}
