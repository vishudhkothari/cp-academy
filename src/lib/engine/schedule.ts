// Fixed weekly-contest schedule — the discipline mechanism. The weekly stops
// being "click whenever" and becomes a standing appointment at a fixed day/time,
// with a countdown. Computed in IST (the user's timezone) so it's correct even
// when the server runs in UTC (e.g. Vercel).

export const IST_OFFSET_MIN = 330; // UTC+5:30
const MS_MIN = 60_000;
const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;

// How long after the slot opens you can still start the week's contest. Miss it
// and it rolls to next week — that's the point.
export const OPEN_WINDOW_H = 6;

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function formatHour(h: number): string {
  const ap = h < 12 ? "AM" : "PM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:00 ${ap}`;
}

export type WeeklySchedule = {
  thisSlot: Date; // the most recent slot instant (<= now)
  nextSlot: Date; // the following week's slot
  openUntil: Date; // thisSlot + OPEN_WINDOW_H
  isOpen: boolean; // now within [thisSlot, openUntil)
  nextOpen: Date; // when the slot next opens (thisSlot if open now, else nextSlot)
  label: string; // e.g. "Sunday 8:00 PM IST"
};

// Resolve the fixed (day, hour)-in-IST slot to real UTC instants, independent of
// the server's timezone. We shift `now` into IST wall-clock (read via UTC
// getters), snap to the target weekday/hour, then shift back.
export function weeklySchedule(day: number, hour: number, now: Date = new Date()): WeeklySchedule {
  const shifted = new Date(now.getTime() + IST_OFFSET_MIN * MS_MIN);
  const s = new Date(shifted);
  s.setUTCHours(hour, 0, 0, 0);
  const diff = (s.getUTCDay() - day + 7) % 7; // days back to the target weekday
  s.setUTCDate(s.getUTCDate() - diff);
  if (s.getTime() > shifted.getTime()) s.setUTCDate(s.getUTCDate() - 7); // slot must be <= now

  const thisSlot = new Date(s.getTime() - IST_OFFSET_MIN * MS_MIN);
  const nextSlot = new Date(thisSlot.getTime() + 7 * MS_DAY);
  const openUntil = new Date(thisSlot.getTime() + OPEN_WINDOW_H * MS_HOUR);
  const isOpen = now.getTime() >= thisSlot.getTime() && now.getTime() < openUntil.getTime();

  return {
    thisSlot,
    nextSlot,
    openUntil,
    isOpen,
    nextOpen: isOpen ? thisSlot : nextSlot,
    label: `${DAY_NAMES[day]} ${formatHour(hour)} IST`,
  };
}
