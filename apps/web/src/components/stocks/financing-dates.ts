function isoDateValue(value?: string | null) {
  return value ? String(value).slice(0, 10) : '';
}

export function positiveInteger(value?: string | number | null) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function addMonthsToIsoDate(value?: string | null, durationMonths?: string | number | null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDateValue(value));
  const months = positiveInteger(durationMonths);
  if (!match || !months) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const source = new Date(Date.UTC(year, monthIndex, day));
  if (
    source.getUTCFullYear() !== year ||
    source.getUTCMonth() !== monthIndex ||
    source.getUTCDate() !== day
  )
    return null;
  const targetMonthIndex = monthIndex + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export function financingDurationInMonths(start?: string | null, end?: string | null) {
  const startValue = isoDateValue(start);
  const endValue = isoDateValue(end);
  const startMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startValue);
  const endMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endValue);
  if (!startMatch || !endMatch) return null;
  const months =
    (Number(endMatch[1]) - Number(startMatch[1])) * 12 +
    Number(endMatch[2]) -
    Number(startMatch[2]);
  return months > 0 && addMonthsToIsoDate(startValue, months) === endValue ? months : null;
}
