// Local-calendar-date helpers. `Date#toISOString()` always converts to UTC
// first, which silently shifts the date by one for any timezone ahead of
// UTC (e.g. Pakistan, UTC+5) — `addDaysStr("2026-08-06", 1)` would come back
// as "2026-08-06" again instead of "2026-08-07". These stay in local wall-
// clock time throughout, matching what a <input type="date"> actually shows.

function toDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function addDaysStr(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function daysAgoStr(days: number): string {
  return addDaysStr(todayStr(), -days);
}
