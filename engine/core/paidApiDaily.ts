import type { PaidApiId } from './paidApiTelemetry';

const STORAGE_KEY = 'siyf_paid_api_daily_v1';

export interface PaidApiDailyRecord {
  date: string;
  count: number;
  byApi: Partial<Record<PaidApiId, number>>;
}

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

let storageOverride: StorageLike | null = null;
let dateOverride: string | null = null;

function getStorage(): StorageLike | null {
  if (storageOverride) return storageOverride;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

/** Local calendar day — resets at user's midnight. */
export function getPaidApiLocalDateKey(): string {
  if (dateOverride) return dateOverride;
  return new Date().toLocaleDateString('en-CA');
}

export function loadPaidApiDailyRecord(): PaidApiDailyRecord {
  const today = getPaidApiLocalDateKey();
  const storage = getStorage();
  if (!storage) return { date: today, count: 0, byApi: {} };

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { date: today, count: 0, byApi: {} };
    const parsed = JSON.parse(raw) as PaidApiDailyRecord;
    if (parsed.date !== today) return { date: today, count: 0, byApi: {} };
    return {
      date: today,
      count: parsed.count ?? 0,
      byApi: parsed.byApi ?? {},
    };
  } catch {
    return { date: today, count: 0, byApi: {} };
  }
}

function persistDailyRecord(record: PaidApiDailyRecord): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Private mode / quota — gate still works in-memory for this session via telemetry sync
  }
}

export function getPaidApiDailyCount(): number {
  return loadPaidApiDailyRecord().count;
}

export function getPaidApiDailyCounts(): PaidApiDailyRecord {
  return loadPaidApiDailyRecord();
}

export function trackPaidApiDaily(api: PaidApiId): PaidApiDailyRecord {
  const record = loadPaidApiDailyRecord();
  record.count += 1;
  record.byApi[api] = (record.byApi[api] ?? 0) + 1;
  persistDailyRecord(record);
  return record;
}

export function resetPaidApiDailyCounts(): void {
  const storage = getStorage();
  storage?.removeItem(STORAGE_KEY);
  dateOverride = null;
}

/** Test hooks — not for production use. */
export function __setPaidApiStorageForTest(storage: StorageLike | null): void {
  storageOverride = storage;
}

export function __setPaidApiDateForTest(date: string | null): void {
  dateOverride = date;
}

export function __setPaidApiDailyRecordForTest(record: PaidApiDailyRecord): void {
  persistDailyRecord(record);
}
