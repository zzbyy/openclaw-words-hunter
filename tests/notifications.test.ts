import { describe, it, expect } from 'vitest';
import { isWeeklyRecapDue, isDailyReviewDue, mostRecentWeeklyRecapSlot, resolveRecapChannel } from '../src/notifications.js';

describe('resolveRecapChannel', () => {
  it('prefers explicit recap_channel over primary_channel', () => {
    expect(resolveRecapChannel('weekly-room', { primary_channel: 'default-room' })).toBe('weekly-room');
  });

  it('falls back to primary_channel when explicit recap_channel is absent', () => {
    expect(resolveRecapChannel(undefined, { primary_channel: 'default-room' })).toBe('default-room');
  });
});

describe('weekly recap scheduling', () => {
  it('treats Sunday 09:37 as due for the current slot', () => {
    const now = new Date('2026-04-05T09:37:00');
    expect(isWeeklyRecapDue(now)).toBe(true);
  });

  it('dedupes after a restart once the current slot was already sent', () => {
    const now = new Date('2026-04-05T09:37:00');
    expect(isWeeklyRecapDue(now, '2026-04-05T09:05:00')).toBe(false);
  });

  it('uses the most recent Sunday 09:00 slot for late restarts', () => {
    const slot = mostRecentWeeklyRecapSlot(new Date(2026, 3, 6, 14, 0, 0));
    expect(slot.getDay()).toBe(0);
    expect(slot.getHours()).toBe(9);
    expect(slot.getMinutes()).toBe(0);
    expect(slot.getDate()).toBe(5);
  });
});

describe('daily review scheduling', () => {
  it('before 9pm → not due', () => {
    const now = new Date('2026-04-04T20:59:00');
    expect(isDailyReviewDue(now)).toBe(false);
  });

  it('at 9pm, first time → due', () => {
    const now = new Date('2026-04-04T21:00:00');
    expect(isDailyReviewDue(now)).toBe(true);
  });

  it('at 9pm, already fired today → not due', () => {
    const now = new Date(2026, 3, 4, 21, 15, 0);
    const lastFired = new Date(2026, 3, 4, 21, 0, 0).toISOString();
    expect(isDailyReviewDue(now, lastFired)).toBe(false);
  });

  it('at 9pm, last fired yesterday → due', () => {
    const now = new Date(2026, 3, 4, 21, 0, 0);
    const lastFired = new Date(2026, 3, 3, 21, 0, 0).toISOString();
    expect(isDailyReviewDue(now, lastFired)).toBe(true);
  });
});
