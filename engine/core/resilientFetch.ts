import { resolveProxyUrl, getSiyfAuthJwt } from '../../config/siyfApi';
import { createEngineLog } from './engineUtils';
import { canUsePaidApi, recordPaidApiGatePass, trackPaidApiHourly } from '../adjuster/paidKillSwitch';
import { detectPaidApi, trackPaidApiUse } from './paidApiTelemetry';

const log = createEngineLog('resilient-fetch');

const inFlight = new Map<string, Promise<unknown>>();

export function dedupeRequest<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

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
      return (await res.json()) as T;
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
