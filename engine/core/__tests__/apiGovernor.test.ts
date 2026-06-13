import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  AGE_OUT_MS,
  GOVERNOR_HOUR_BUDGET,
  governorFetch,
  getGovernorStats,
  inferPriority,
  resetGovernor,
} from '../apiGovernor';

describe('apiGovernor', () => {
  beforeEach(() => {
    resetGovernor();
    vi.useRealTimers();
  });

  it('infers priority from label', () => {
    expect(inferPriority('espn-nfl-scoreboard')).toBe(0);
    expect(inferPriority('espn-nfl-summary')).toBe(1);
    expect(inferPriority('espn-nfl-standings')).toBe(2);
    expect(inferPriority('espn-nfl-teams')).toBe(3);
  });

  it('processes P0 fetches immediately when tokens available', async () => {
    const result = await governorFetch(async () => 'ok', { priority: 0, label: 'live-scoreboard' });
    expect(result).toBe('ok');
    expect(getGovernorStats().processed).toBe(1);
  });

  it('queues low-priority when budget is exhausted', async () => {
    for (let i = 0; i < GOVERNOR_HOUR_BUDGET; i++) {
      await governorFetch(async () => 'x', { priority: 0, label: 'live' });
    }

    const result = await governorFetch(async () => 'queued', { priority: 2, label: 'standings' });
    expect(result).toBe('queued');
    expect(getGovernorStats().queued).toBeGreaterThan(0);
  });

  it('promotes aged-out low-priority entries', async () => {
    vi.useFakeTimers();
    resetGovernor();

    for (let i = 0; i < GOVERNOR_HOUR_BUDGET; i++) {
      void governorFetch(async () => 'x', { priority: 0, label: 'live' });
    }

    const promise = governorFetch(async () => 'promoted', { priority: 2, label: 'standings' });
    vi.advanceTimersByTime(AGE_OUT_MS + 2_000);
    const result = await promise;
    expect(result).toBe('promoted');
    vi.useRealTimers();
  });
});
