import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dedupeRequest,
  fetchJsonResilient,
  getInFlightStats,
  resetInFlightRequests,
  resetResilientFetchBackoff,
} from '../resilientFetch';
import { getGovernorStats, resetGovernor } from '../apiGovernor';

describe('fetchJsonResilient transient errors', () => {
  beforeEach(() => {
    resetResilientFetchBackoff();
    resetInFlightRequests();
    resetGovernor();
    vi.restoreAllMocks();
  });

  it('returns null on 404 without retry noise', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));

    const result = await fetchJsonResilient('/api/espn/test', undefined, {
      label: 'test-404',
      retries: 2,
    });

    expect(result).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries then throws on 503 when throwOnTransientError is set', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));

    await expect(
      fetchJsonResilient('https://api.wtatennis.com/tennis/players?name=test', undefined, {
        label: 'wta-test',
        retries: 1,
        throwOnTransientError: true,
      }),
    ).rejects.toThrow('503');

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('backs off per upstream host after 503', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));

    await fetchJsonResilient('https://api.wtatennis.com/a', undefined, {
      label: 'wta-a',
      retries: 0,
    });

    const second = await fetchJsonResilient('https://api.wtatennis.com/b', undefined, {
      label: 'wta-b',
      retries: 0,
    });

    expect(second).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns null on XML response without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<?xml version="1.0"?><scoreboard/>', {
          status: 200,
          headers: { 'Content-Type': 'application/xml' },
        }),
      ),
    );

    const result = await fetchJsonResilient('/api/fetch?url=https://www.wnba.com/api/live/scoreboard', undefined, {
      label: 'wnba-official',
      retries: 1,
    });

    expect(result).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rethrows network errors when throwOnTransientError is set', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(
      fetchJsonResilient('/api/espn/test', undefined, {
        label: 'net-fail',
        retries: 0,
        throwOnTransientError: true,
      }),
    ).rejects.toThrow('network down');
  });
});

describe('dedupeRequest coalescing', () => {
  beforeEach(() => {
    resetInFlightRequests();
    resetGovernor();
    vi.restoreAllMocks();
  });

  it('runs fn once for 10 parallel calls with the same key', async () => {
    let runs = 0;
    const fn = vi.fn(async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 10));
      return 'ok';
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => dedupeRequest('test-key', fn)),
    );

    expect(results).toEqual(Array(10).fill('ok'));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(getInFlightStats().coalesceHits).toBe(9);
    expect(getInFlightStats().executions).toBe(1);
  });

  it('coalesces parallel fetchJsonResilient before governor spends tokens', async () => {
    let fetchCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        fetchCount += 1;
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    await Promise.all(
      Array.from({ length: 10 }, () =>
        fetchJsonResilient('/api/espn/apis/site/v2/sports/basketball/nba/scoreboard', undefined, {
          label: 'espn-scoreboard',
          retries: 0,
        }),
      ),
    );

    expect(fetchCount).toBe(1);
    expect(getGovernorStats().processed).toBe(1);
    expect(getInFlightStats().coalesceHits).toBe(9);
  });
});
