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
