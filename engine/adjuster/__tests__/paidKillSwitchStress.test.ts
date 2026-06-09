import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canUsePaidApi,
  HOUR_MS,
  PAID_API_DAILY_LIMIT,
  PAID_API_LIMITS,
  recordPaidApiGatePass,
  resetPaidKillSwitch,
  trackPaidApiHourly,
  __setHourlyWindowForTest,
} from '../paidKillSwitch';
import {
  __setPaidApiDailyRecordForTest,
  __setPaidApiDateForTest,
  __setPaidApiStorageForTest,
  getPaidApiDailyCount,
  loadPaidApiDailyRecord,
  resetPaidApiDailyCounts,
  trackPaidApiDaily,
} from '../../core/paidApiDaily';
import { resetPaidApiSessionCounts, trackPaidApiUse } from '../../core/paidApiTelemetry';
import { shouldFetchBdlScoreboard } from '../../core/paidApiPolicy';
import { makeGame, makeTeam } from '../../core/__tests__/fixtures';

function simulateGatePass(api: Parameters<typeof trackPaidApiUse>[0], times = 1): void {
  for (let i = 0; i < times; i++) {
    trackPaidApiUse(api);
    recordPaidApiGatePass(api);
  }
}

describe('paid kill switch stress', () => {
  const memoryStore = new Map<string, string>();

  beforeEach(() => {
    resetPaidKillSwitch();
    resetPaidApiSessionCounts();
    resetPaidApiDailyCounts();
    memoryStore.clear();
    __setPaidApiStorageForTest({
      getItem: (key) => memoryStore.get(key) ?? null,
      setItem: (key, value) => { memoryStore.set(key, value); },
      removeItem: (key) => { memoryStore.delete(key); },
    });
    __setPaidApiDateForTest('2026-06-09');
  });

  afterEach(() => {
    vi.useRealTimers();
    __setPaidApiStorageForTest(null);
    __setPaidApiDateForTest(null);
  });

  it('allows paid calls under daily cap for legitimate fallback use', () => {
    simulateGatePass('bdl', 5);
    const gate = canUsePaidApi('bdl');
    expect(gate.allowed).toBe(true);
    expect(gate.dailyCount).toBe(5);
    expect(gate.dailyLimit).toBe(PAID_API_DAILY_LIMIT);
  });

  it('blocks at daily cap with reset hint — free feeds still implied', () => {
    __setPaidApiDailyRecordForTest({
      date: '2026-06-09',
      count: PAID_API_DAILY_LIMIT,
      byApi: { bdl: PAID_API_DAILY_LIMIT },
    });
    const gate = canUsePaidApi('odds');
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain('daily limit');
    expect(gate.reason).toContain('free feeds');
  });

  it('allows the 200th daily call then blocks the 201st', () => {
    __setPaidApiDailyRecordForTest({
      date: '2026-06-09',
      count: PAID_API_DAILY_LIMIT - 1,
      byApi: { odds: PAID_API_DAILY_LIMIT - 1 },
    });
    expect(canUsePaidApi('odds').allowed).toBe(true);
    recordPaidApiGatePass('odds');
    expect(getPaidApiDailyCount()).toBe(PAID_API_DAILY_LIMIT);
    expect(canUsePaidApi('odds').allowed).toBe(false);
  });

  it('resets daily count on new local calendar day', () => {
    simulateGatePass('bdl', 10);
    expect(getPaidApiDailyCount()).toBe(10);

    __setPaidApiDateForTest('2026-06-10');
    expect(loadPaidApiDailyRecord().count).toBe(0);
    expect(canUsePaidApi('bdl').allowed).toBe(true);
  });

  it('persists daily usage to storage', () => {
    trackPaidApiDaily('odds');
    trackPaidApiDaily('odds');
    const stored = JSON.parse(memoryStore.get('siyf_paid_api_daily_v1') ?? '{}');
    expect(stored.count).toBe(2);
    expect(stored.byApi.odds).toBe(2);
  });

  it('isolates APIs — bdl session max does not block odds', () => {
    simulateGatePass('bdl', PAID_API_LIMITS.bdl.perSession);
    expect(canUsePaidApi('bdl').allowed).toBe(false);
    expect(canUsePaidApi('odds').allowed).toBe(true);
    expect(canUsePaidApi('sgo').allowed).toBe(true);
  });

  it('isolates APIs — odds hourly max does not block bdl', () => {
    const now = Date.now();
    __setHourlyWindowForTest('odds', PAID_API_LIMITS.odds.perHour, now);
    expect(canUsePaidApi('odds').allowed).toBe(false);
    expect(canUsePaidApi('bdl').allowed).toBe(true);
  });

  it('resets hourly window after rollover', () => {
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start);

    for (let i = 0; i < PAID_API_LIMITS.sgo.perHour; i++) {
      trackPaidApiHourly('sgo');
    }
    expect(canUsePaidApi('sgo').allowed).toBe(false);

    vi.setSystemTime(start + HOUR_MS + 1);
    expect(canUsePaidApi('sgo').allowed).toBe(true);
  });

  it('ESPN-down scenario: BDL still allowed when games need score fallback', () => {
    const liveNoScore = makeGame({
      id: 'espn-down',
      statusState: 'in',
      away: makeTeam({ name: 'LAL', abbr: 'LAL', score: '' }),
      home: makeTeam({ name: 'BOS', abbr: 'BOS', score: '' }),
    });
    expect(shouldFetchBdlScoreboard([liveNoScore])).toBe(true);
    expect(canUsePaidApi('bdl').allowed).toBe(true);
  });

  it('ESPN-down scenario: daily cap blocks paid but policy still identifies gaps', () => {
    const liveNoScore = makeGame({
      id: 'espn-down-capped',
      statusState: 'in',
      away: makeTeam({ name: 'LAL', abbr: 'LAL', score: '' }),
      home: makeTeam({ name: 'BOS', abbr: 'BOS', score: '' }),
    });
    __setPaidApiDailyRecordForTest({
      date: '2026-06-09',
      count: PAID_API_DAILY_LIMIT,
      byApi: {},
    });
    expect(shouldFetchBdlScoreboard([liveNoScore])).toBe(true);
    expect(canUsePaidApi('bdl').allowed).toBe(false);
  });

  it('mixed API usage counts toward shared daily budget', () => {
    simulateGatePass('bdl', 100);
    simulateGatePass('odds', 99);
    expect(getPaidApiDailyCount()).toBe(199);
    expect(canUsePaidApi('sgo').allowed).toBe(true);
    recordPaidApiGatePass('sgo');
    expect(canUsePaidApi('sports').allowed).toBe(false);
  });

  it('session limit message names the blocked API only', () => {
    simulateGatePass('sports-basketball', PAID_API_LIMITS['sports-basketball'].perSession);
    const gate = canUsePaidApi('sports-basketball');
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain('sports-basketball');
    expect(gate.reason).toContain('other paid APIs still available');
  });
});
