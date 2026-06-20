import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJsonResilient, resetResilientFetchBackoff } from '../resilientFetch';

describe('fetchJsonResilient transient errors', () => {
  beforeEach(() => {
    resetResilientFetchBackoff();
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
