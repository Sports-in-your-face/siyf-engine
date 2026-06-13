import { describe, expect, it } from 'vitest';
import type { Game } from '../../types';
import {
  calendarDateKey,
  gameCalendarDate,
  shiftCalendarDate,
  todayCalendarKey,
} from '../webView';

const TZ = 'America/New_York';

function gameWithStart(startTime?: string, statusState: Game['statusState'] = 'pre'): Game {
  return {
    id: 'g1',
    sport: 'NBA',
    statusState,
    home: { name: 'Home', abbr: 'HOM', score: 0 },
    away: { name: 'Away', abbr: 'AWY', score: 0 },
    timing: startTime ? { startTime, timezone: TZ, localStart: '', proofed: true } : undefined,
  } as Game;
}

describe('calendar date helpers', () => {
  it('uses local calendar day for evening games that cross UTC midnight', () => {
    const now = new Date('2026-06-13T20:00:00-04:00');
    const game = gameWithStart('2026-06-14T00:30:00.000Z');
    expect(gameCalendarDate(game, now, TZ)).toBe('2026-06-13');
    expect(game.timing!.startTime!.slice(0, 10)).toBe('2026-06-14');
  });

  it('keeps afternoon games on the same local day', () => {
    const now = new Date('2026-06-13T14:00:00-04:00');
    const game = gameWithStart('2026-06-13T18:00:00.000Z');
    expect(gameCalendarDate(game, now, TZ)).toBe('2026-06-13');
  });

  it('shifts calendar dates in local time', () => {
    expect(shiftCalendarDate('2026-06-13', 1, TZ)).toBe('2026-06-14');
    expect(shiftCalendarDate('2026-06-13', -1, TZ)).toBe('2026-06-12');
  });

  it('todayCalendarKey matches calendarDateKey for the same instant', () => {
    const now = new Date('2026-06-13T09:00:00-04:00');
    expect(todayCalendarKey(now, TZ)).toBe(calendarDateKey(now, TZ));
  });
});
