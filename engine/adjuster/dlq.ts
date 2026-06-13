import type { ParseInvariantIssue } from './invariants';

export interface FieldDlqEntry {
  dedupeKey: string;
  sport: string;
  gameId?: string;
  canonicalField: string;
  attemptedPaths: string[];
  sniffCandidates: { key: string; value: unknown; score: number }[];
  firstSeenAt: number;
  lastSeenAt: number;
  occurrenceCount: number;
}

export interface FieldDlqInput {
  sport: string;
  gameId?: string;
  canonicalField: string;
  attemptedPaths?: string[];
  sniffCandidates?: { key: string; value: unknown; score: number }[];
}

const MAX_ENTRIES = 1_000;
const ALERT_THROTTLE_MS = 5 * 60_000;

const store = new Map<string, FieldDlqEntry>();
const evictionOrder: string[] = [];
const lastAlertAt = new Map<string, number>();

function buildDedupeKey(input: FieldDlqInput): string {
  return `${input.sport}:${input.canonicalField}:${input.gameId ?? 'batch'}`;
}

function evictIfNeeded(): void {
  while (store.size > MAX_ENTRIES && evictionOrder.length) {
    const key = evictionOrder.shift();
    if (key) store.delete(key);
  }
}

/** Record a field mapping failure; deduplicates and caps storage. */
export function recordFieldDlq(input: FieldDlqInput): FieldDlqEntry {
  const dedupeKey = buildDedupeKey(input);
  const now = Date.now();
  const existing = store.get(dedupeKey);

  if (existing) {
    existing.lastSeenAt = now;
    existing.occurrenceCount += 1;
    if (input.attemptedPaths?.length) existing.attemptedPaths = input.attemptedPaths;
    if (input.sniffCandidates?.length) existing.sniffCandidates = input.sniffCandidates;
    return existing;
  }

  const entry: FieldDlqEntry = {
    dedupeKey,
    sport: input.sport,
    gameId: input.gameId,
    canonicalField: input.canonicalField,
    attemptedPaths: input.attemptedPaths ?? [],
    sniffCandidates: input.sniffCandidates ?? [],
    firstSeenAt: now,
    lastSeenAt: now,
    occurrenceCount: 1,
  };

  store.set(dedupeKey, entry);
  evictionOrder.push(dedupeKey);
  evictIfNeeded();
  return entry;
}

/** Whether a throttled drift alert should fire for this DLQ key. */
export function shouldEmitDlqAlert(dedupeKey: string): boolean {
  const now = Date.now();
  const last = lastAlertAt.get(dedupeKey) ?? 0;
  if (now - last < ALERT_THROTTLE_MS) return false;
  lastAlertAt.set(dedupeKey, now);
  return true;
}

export function getDlqSnapshot(limit = 50): FieldDlqEntry[] {
  return [...store.values()]
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .slice(0, limit);
}

export function getDlqEntry(dedupeKey: string): FieldDlqEntry | undefined {
  return store.get(dedupeKey);
}

export function resetFieldDlq(): void {
  store.clear();
  evictionOrder.length = 0;
  lastAlertAt.clear();
}

/** Build a drift issue from a DLQ entry (optional fields only). */
export function dlqToInvariantIssue(entry: FieldDlqEntry): ParseInvariantIssue {
  return {
    code: 'field_mapping_failed',
    severity: 'warn',
    message: `Could not resolve ${entry.canonicalField} (${entry.occurrenceCount}x)`,
    field: entry.canonicalField,
    gameId: entry.gameId,
  };
}

declare global {
  interface Window {
    __siyfDlq?: {
      getSnapshot: typeof getDlqSnapshot;
      getEntry: typeof getDlqEntry;
      reset: typeof resetFieldDlq;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__siyfDlq = {
    getSnapshot: getDlqSnapshot,
    getEntry: getDlqEntry,
    reset: resetFieldDlq,
  };
}
