/**
 * Global API governor — token bucket + priority queue with age-out promotion.
 * Queues excess requests instead of dropping; P0 (live scoreboard) never starved.
 */

export const GOVERNOR_HOUR_BUDGET = 3_600;
export const AGE_OUT_MS = 240_000;
export const TOKEN_REFILL_PER_SEC = GOVERNOR_HOUR_BUDGET / 3_600;

export type GovernorPriority = 0 | 1 | 2 | 3;

export interface GovernorFetchOptions {
  priority?: GovernorPriority;
  label?: string;
}

interface QueueEntry<T> {
  priority: GovernorPriority;
  enqueuedAt: number;
  promotedAt?: number;
  label: string;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export interface GovernorStats {
  tokens: number;
  queueDepth: number;
  processed: number;
  queued: number;
  promotions: number;
  rejected: number;
}

let tokens = GOVERNOR_HOUR_BUDGET;
let lastRefillAt = Date.now();
const queue: QueueEntry<unknown>[] = [];
let processing = false;

let stats: GovernorStats = {
  tokens: GOVERNOR_HOUR_BUDGET,
  queueDepth: 0,
  processed: 0,
  queued: 0,
  promotions: 0,
  rejected: 0,
};

function refillTokens(): void {
  const now = Date.now();
  const elapsed = (now - lastRefillAt) / 1000;
  if (elapsed <= 0) return;
  tokens = Math.min(GOVERNOR_HOUR_BUDGET, tokens + elapsed * TOKEN_REFILL_PER_SEC);
  lastRefillAt = now;
  stats.tokens = Math.floor(tokens);
}

function effectivePriority(entry: QueueEntry<unknown>): GovernorPriority {
  const age = Date.now() - entry.enqueuedAt;
  if (age < AGE_OUT_MS) return entry.priority;
  const bumped = Math.max(0, entry.priority - 1) as GovernorPriority;
  if (bumped !== entry.priority && !entry.promotedAt) {
    entry.promotedAt = Date.now();
    stats.promotions += 1;
  }
  return bumped;
}

function sortQueue(): void {
  queue.sort((a, b) => {
    const pa = effectivePriority(a);
    const pb = effectivePriority(b);
    if (pa !== pb) return pa - pb;
    return a.enqueuedAt - b.enqueuedAt;
  });
}

async function drainQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  try {
    while (queue.length) {
      refillTokens();
      if (tokens < 1) {
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }

      sortQueue();
      const entry = queue.shift();
      if (!entry) break;

      tokens -= 1;
      stats.tokens = Math.floor(tokens);
      stats.queueDepth = queue.length;

      try {
        const result = await entry.run();
        entry.resolve(result);
        stats.processed += 1;
      } catch (err) {
        entry.reject(err);
      }
    }
  } finally {
    processing = false;
    stats.queueDepth = queue.length;
  }
}

/** Schedule a fetch through the global governor. */
export function governorFetch<T>(
  run: () => Promise<T>,
  options: GovernorFetchOptions = {},
): Promise<T> {
  refillTokens();

  return new Promise<T>((resolve, reject) => {
    const entry: QueueEntry<T> = {
      priority: options.priority ?? inferPriority(options.label),
      enqueuedAt: Date.now(),
      label: options.label ?? 'fetch',
      run,
      resolve,
      reject,
    };

    if (tokens >= 1 && entry.priority === 0 && queue.length === 0) {
      tokens -= 1;
      stats.tokens = Math.floor(tokens);
      entry
        .run()
        .then((v) => {
          stats.processed += 1;
          resolve(v);
        })
        .catch(reject);
      return;
    }

    queue.push(entry as QueueEntry<unknown>);
    stats.queued += 1;
    stats.queueDepth = queue.length;
    void drainQueue();
  });
}

export function inferPriority(label?: string): GovernorPriority {
  const l = (label ?? '').toLowerCase();
  if (l.includes('scoreboard') || l.includes('live')) return 0;
  if (l.includes('summary') || l.includes('detail') || l.includes('boxscore') || l.includes('play')) return 1;
  if (l.includes('standing') || l.includes('schedule') || l.includes('leader')) return 2;
  return 3;
}

export function getGovernorStats(): GovernorStats {
  refillTokens();
  return { ...stats, queueDepth: queue.length, tokens: Math.floor(tokens) };
}

export function resetGovernor(): void {
  tokens = GOVERNOR_HOUR_BUDGET;
  lastRefillAt = Date.now();
  queue.length = 0;
  processing = false;
  stats = {
    tokens: GOVERNOR_HOUR_BUDGET,
    queueDepth: 0,
    processed: 0,
    queued: 0,
    promotions: 0,
    rejected: 0,
  };
}

declare global {
  interface Window {
    __siyfApiGovernor?: {
      getStats: typeof getGovernorStats;
      reset: typeof resetGovernor;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__siyfApiGovernor = {
    getStats: getGovernorStats,
    reset: resetGovernor,
  };
}
