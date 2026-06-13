import { resolveProxyUrl, getSiyfAuthJwt } from '../../config/siyfApi';
import { createEngineLog } from './engineUtils';
import { canUsePaidApi, recordPaidApiGatePass, trackPaidApiHourly } from '../adjuster/paidKillSwitch';
import { detectPaidApi, trackPaidApiUse } from './paidApiTelemetry';
import { governorFetch, inferPriority } from './apiGovernor';

const log = createEngineLog('resilient-fetch');

const inFlight = new Map<string, Promise<unknown>>();

let coalesceHits = 0;
let executions = 0;

export interface InFlightStats {
  inFlight: number;
  coalesceHits: number;
  executions: number;
}

export function getInFlightStats(): InFlightStats {
  return {
    inFlight: inFlight.size,
    coalesceHits,
    executions,
  };
}

/** Stable dedupe keys for hot-loop fetch paths. */
export function coalesceKeyScoreboard(cacheKey: string): string {
  return `scoreboard:${cacheKey}`;
}

export function coalesceKeyGame(gameId: string): string {
  return `game:${gameId}`;
}

export function coalesceKeyEspnEvent(eventId: string): string {
  return `espn:event:${eventId}`;
}

export function coalesceKeyFetchGames(
  sport: string,
  options?: { bypassCache?: boolean; bypassHashGate?: boolean },
): string {
  const bypass = options?.bypassCache ? 'bc' : 'c';
  const hash = options?.bypassHashGate ? 'bh' : 'h';
  return `fetchGames:${sport}:${bypass}:${hash}`;
}

function fetchDedupeKey(url: string, opts?: ResilientFetchOptions): string {
  const resolved = resolveProxyUrl(url) || url;
  return opts?.bypassCache ? `fetch:${resolved}:bypass` : `fetch:${resolved}`;
}

export function dedupeRequest<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) {
    coalesceHits += 1;
    return existing as Promise<T>;
  }

  executions += 1;
  const promise = fn().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = 'request',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface ResilientFetchOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  label?: string;
  /** Skip edge + client cache for this request (after cache bust). */
  bypassCache?: boolean;
  /** Throw on 502/503/429 after retries so callers skip negative cache. */
  throwOnTransientError?: boolean;
}

/** Back off per upstream host (not full proxy URL) after rate limits / overload. */
function backoffKey(resolvedUrl: string): string {
  try {
    const parsed = new URL(resolvedUrl);
    if (parsed.pathname.endsWith('/api/fetch')) {
      const target = parsed.searchParams.get('url');
      if (target) return new URL(target).hostname;
    }
    return parsed.hostname;
  } catch {
    return resolvedUrl;
  }
}

const TRANSIENT_HTTP_STATUSES = new Set([429, 502, 503]);

const DEFAULT_OPTS = {
  timeout: 8_000,
  retries: 2,
  retryDelay: 400,
  label: 'fetch',
  bypassCache: false,
  throwOnTransientError: false,
} satisfies Required<ResilientFetchOptions>;

/** Skip repeat calls after 429 until the window clears. */
const rateLimitedUntil = new Map<string, number>();
const RATE_LIMIT_BACKOFF_MS = 60_000;

export async function fetchJsonResilient<T>(
  url: string,
  init?: RequestInit,
  opts?: ResilientFetchOptions,
): Promise<T | null> {
  const key = fetchDedupeKey(url, opts);
  return dedupeRequest(key, () =>
    governorFetch(
      () => fetchJsonResilientInner<T>(url, init, opts),
      { label: opts?.label, priority: inferPriority(opts?.label) },
    ),
  );
}

async function fetchJsonResilientInner<T>(
  url: string,
  init?: RequestInit,
  opts?: ResilientFetchOptions,
): Promise<T | null> {
  const { timeout, retries, retryDelay, label, bypassCache, throwOnTransientError } = {
    ...DEFAULT_OPTS,
    ...opts,
  };

  if (!url) {
    log('warn', label, 'empty url — skipping fetch');
    return null;
  }

  const resolvedUrl = resolveProxyUrl(url);
  if (!resolvedUrl) {
    log('warn', label, 'empty resolved url — skipping fetch');
    return null;
  }
  const hostKey = backoffKey(resolvedUrl);
  const extraHeaders: Record<string, string> = {};
  if (bypassCache) extraHeaders['X-SIYF-Bypass-Cache'] = '1';

  // Attach premium JWT for paid proxy routes so server can verify membership.
  const jwt = getSiyfAuthJwt();
  if (jwt) {
    const lowerUrl = resolvedUrl.toLowerCase();
    if (lowerUrl.includes('/api/odds') || lowerUrl.includes('/api/bdl') || lowerUrl.includes('/api/sgo')) {
      extraHeaders['X-Appwrite-JWT'] = jwt;
    }
  }

  const backoffUntil = rateLimitedUntil.get(hostKey);
  if (!bypassCache && backoffUntil && Date.now() < backoffUntil) {
    if (throwOnTransientError) {
      throw new Error(`${label} backoff active for ${hostKey}`);
    }
    return null;
  }

  const paidApi = detectPaidApi(resolvedUrl);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt === 0 && paidApi) {
        if (
          (paidApi === 'odds' || paidApi === 'bdl' || paidApi === 'sgo') &&
          !getSiyfAuthJwt()
        ) {
          log('warn', label, 'paid API requires auth — skipping');
          return null;
        }
        const gate = canUsePaidApi(paidApi);
        if (!gate.allowed) {
          log('warn', label, `paid API kill switch: ${gate.reason}`);
          return null;
        }
        trackPaidApiUse(paidApi, label);
        trackPaidApiHourly(paidApi);
        recordPaidApiGatePass(paidApi);
      }

      const res = await withTimeout(
        fetch(resolvedUrl, {
          ...init,
          headers: { Accept: 'application/json', ...extraHeaders, ...init?.headers },
        }),
        timeout,
        label,
      );
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          log('warn', label, `returned ${res.status} (auth error) — skipping retries`);
          return null;
        }
        // Missing resources won't appear on retry — avoid hammering proxies and console noise.
        if (res.status === 400 || res.status === 404 || res.status === 410) {
          return null;
        }
        if (TRANSIENT_HTTP_STATUSES.has(res.status)) {
          rateLimitedUntil.set(hostKey, Date.now() + RATE_LIMIT_BACKOFF_MS);
          if (attempt < retries) {
            await sleep(retryDelay * (attempt + 1));
            continue;
          }
          if (throwOnTransientError) {
            throw new Error(`${label} returned ${res.status}`);
          }
          return null;
        }
        if (attempt < retries) {
          await sleep(retryDelay * (attempt + 1));
          continue;
        }
        return null;
      }
      const text = await res.text();
      const trimmed = text.trim();
      if (!trimmed) return null;
      if (trimmed.startsWith('<')) {
        log('warn', label, 'non-JSON response — skipping');
        return null;
      }
      try {
        return JSON.parse(trimmed) as T;
      } catch (parseErr) {
        if (attempt < retries) {
          await sleep(retryDelay * (attempt + 1));
          continue;
        }
        log('warn', label, 'invalid JSON response', parseErr);
        return null;
      }
    } catch (err) {
      if (attempt < retries) {
        await sleep(retryDelay * (attempt + 1));
        continue;
      }
      if (throwOnTransientError) {
        throw err instanceof Error ? err : new Error(String(err));
      }
      log('warn', label, 'request failed', err);
      return null;
    }
  }
  return null;
}

/** Clear host backoff state (for tests). */
export function resetResilientFetchBackoff(): void {
  rateLimitedUntil.clear();
}

/** Clear in-flight dedupe map (for tests). */
export function resetInFlightRequests(): void {
  inFlight.clear();
  coalesceHits = 0;
  executions = 0;
}

export async function fetchAllSettled<T>(
  tasks: { name: string; run: () => Promise<T | null | undefined> }[],
): Promise<{ name: string; data: T | null }[]> {
  const results = await Promise.allSettled(tasks.map((t) => t.run()));
  return results.map((r, i) => ({
    name: tasks[i].name,
    data: r.status === 'fulfilled' ? (r.value ?? null) : null,
  }));
}

declare global {
  interface Window {
    __siyfCoalesce?: {
      getStats: typeof getInFlightStats;
      reset: typeof resetInFlightRequests;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__siyfCoalesce = {
    getStats: getInFlightStats,
    reset: resetInFlightRequests,
  };
}
