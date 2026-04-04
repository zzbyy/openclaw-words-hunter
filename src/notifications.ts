import type { PluginSidecarConfig } from './types.js';

const WEEKLY_RECAP_DAY = 0; // Sunday
const WEEKLY_RECAP_HOUR = 9;

export function resolveRecapChannel(
  explicitRecapChannel: string | undefined,
  sidecarConfig: Pick<PluginSidecarConfig, 'primary_channel'>,
): string | null {
  return explicitRecapChannel ?? sidecarConfig.primary_channel ?? null;
}

export function mostRecentWeeklyRecapSlot(now: Date): Date {
  const slot = new Date(now);
  slot.setSeconds(0, 0);
  slot.setHours(WEEKLY_RECAP_HOUR, 0, 0, 0);

  const dayOffset = (slot.getDay() - WEEKLY_RECAP_DAY + 7) % 7;
  slot.setDate(slot.getDate() - dayOffset);

  if (slot > now) {
    slot.setDate(slot.getDate() - 7);
  }

  return slot;
}

const DAILY_REVIEW_HOUR = 21; // 9pm

export function isDailyReviewDue(now: Date, lastDailyReviewAt?: string): boolean {
  if (now.getHours() < DAILY_REVIEW_HOUR) return false;

  if (!lastDailyReviewAt) {
    // First time — only fire if current hour matches (avoid firing on install)
    return now.getHours() === DAILY_REVIEW_HOUR;
  }

  const last = new Date(lastDailyReviewAt);
  if (Number.isNaN(last.getTime())) return true;

  // Compare local date strings to avoid UTC/local timezone mismatch
  const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const lastLocal = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  return lastLocal < todayLocal;
}

export function isWeeklyRecapDue(now: Date, lastWeeklyRecapAt?: string): boolean {
  const slot = mostRecentWeeklyRecapSlot(now);

  if (!lastWeeklyRecapAt) {
    // Never sent before — only fire if the recap slot is today (i.e. it's Sunday ≥ 9am).
    // Avoids firing immediately on first install when it's a random weekday.
    return slot.toDateString() === now.toDateString();
  }

  const lastSent = new Date(lastWeeklyRecapAt);
  if (Number.isNaN(lastSent.getTime())) return true;

  return lastSent < slot;
}
