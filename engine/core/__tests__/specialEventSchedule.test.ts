import { describe, expect, it } from 'vitest';
import type { CuratedSpecialEvent } from '../specialGameCatalog';
import {
  formatSpecialEventStatus,
  isSpecialEventNavVisible,
  parseDateEnd,
  parseDateStart,
  resolveSpecialEventWindow,
} from '../specialEventSchedule';

const when = (iso: string) => new Date(`${iso}T15:00:00.000Z`);

function baseEvent(overrides: Partial<CuratedSpecialEvent>): CuratedSpecialEvent {
  return {
    id: 'test_event',
    kind: 'nba_finals',
    sport: 'BASKETBALL',
    label: 'Test Event',
    keywords: ['test'],
    enabled: true,
    nav: { slug: 'test-event', priority: 50 },
    ...overrides,
  };
}

describe('specialEventSchedule', () => {
  it('parses UTC day boundaries', () => {
    expect(parseDateStart('2026-06-01')).toBe(Date.parse('2026-06-01T00:00:00.000Z'));
    expect(parseDateEnd('2026-06-01')).toBe(Date.parse('2026-06-01T23:59:59.999Z'));
  });

  it('single_peak expands warmup and cooldown around Super Bowl Sunday', () => {
    const event = baseEvent({
      id: 'super_bowl',
      kind: 'super_bowl',
      sport: 'FOOTBALL',
      schedule: {
        type: 'single_peak',
        peakDate: '2026-02-08',
        warmupDays: 10,
        cooldownDays: 1,
      },
    });

    const mediaWeek = resolveSpecialEventWindow(event, when('2026-01-30'));
    expect(mediaWeek.phase).toBe('live');

    const dayBeforeWarmup = resolveSpecialEventWindow(event, when('2026-01-28'));
    expect(dayBeforeWarmup.phase).toBe('upcoming');

    const afterCooldown = resolveSpecialEventWindow(event, when('2026-02-10'));
    expect(afterCooldown.phase).toBe('past');
  });

  it('weekend covers all-star span', () => {
    const event = baseEvent({
      kind: 'all_star',
      schedule: {
        type: 'weekend',
        startDate: '2026-02-13',
        endDate: '2026-02-16',
      },
    });

    expect(resolveSpecialEventWindow(event, when('2026-02-14')).phase).toBe('live');
    expect(resolveSpecialEventWindow(event, when('2026-02-12')).phase).toBe('upcoming');
    expect(resolveSpecialEventWindow(event, when('2026-02-17')).phase).toBe('past');
  });

  it('series spans multi-game finals window', () => {
    const event = baseEvent({
      kind: 'nba_finals',
      schedule: {
        type: 'series',
        startDate: '2026-06-04',
        endDate: '2026-06-22',
        cooldownDays: 1,
      },
    });

    const midSeries = resolveSpecialEventWindow(event, when('2026-06-13'));
    expect(midSeries.phase).toBe('live');
    expect(midSeries.progressRatio).toBeGreaterThan(0.2);
    expect(midSeries.progressRatio).toBeLessThan(0.9);
  });

  it('tournament covers month-long World Cup', () => {
    const event = baseEvent({
      kind: 'world_cup',
      sport: 'SOCCER',
      schedule: {
        type: 'tournament',
        startDate: '2026-06-11',
        endDate: '2026-07-19',
      },
    });

    expect(resolveSpecialEventWindow(event, when('2026-06-13')).phase).toBe('live');
    expect(resolveSpecialEventWindow(event, when('2026-05-20')).phase).toBe('upcoming');
  });

  it('shows nav within lead days before start', () => {
    const event = baseEvent({
      schedule: {
        type: 'single_peak',
        peakDate: '2026-02-08',
        warmupDays: 0,
      },
      nav: { slug: 'sb', showLeadDays: 7 },
    });

    expect(isSpecialEventNavVisible(event, when('2026-02-01'))).toBe(true);
    expect(isSpecialEventNavVisible(event, when('2026-01-20'))).toBe(false);
  });

  it('legacy activeFrom/activeUntil still works', () => {
    const event = baseEvent({
      activeFrom: '2026-06-01',
      activeUntil: '2026-06-30',
      schedule: undefined,
    });

    expect(resolveSpecialEventWindow(event, when('2026-06-15')).phase).toBe('live');
  });

  it('formats status strings', () => {
    const upcoming = resolveSpecialEventWindow(
      baseEvent({ activeFrom: '2026-07-01', activeUntil: '2026-07-10' }),
      when('2026-06-20'),
    );
    expect(formatSpecialEventStatus(upcoming)).toMatch(/Starts in/);

    const live = resolveSpecialEventWindow(
      baseEvent({ activeFrom: '2026-06-01', activeUntil: '2026-06-30' }),
      when('2026-06-15'),
    );
    expect(formatSpecialEventStatus(live)).toBe('Live now');
  });
});
