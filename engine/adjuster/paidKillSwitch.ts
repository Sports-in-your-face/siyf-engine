import type { PaidApiId } from '../core/paidApiTelemetry';
import { getPaidApiSessionCounts } from '../core/paidApiTelemetry';
import {
  getPaidApiDailyCount,
  getPaidApiDailyCounts,
  loadPaidApiDailyRecord,
  resetPaidApiDailyCounts,
  trackPaidApiDaily,
} from '../core/paidApiDaily';

export interface PaidApiLimit {
  perSession: number;
  perHour: number;
}

function envInt(key: string, fallback: number): number {
  const raw = typeof import.meta !== 'undefined'
    ? (import.meta as ImportMeta & { env?: Record<string, string> }).env?.[key]
    : undefined;
  const parsed = raw != null ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Global daily cap per user — generous for real use, blocks runaway abuse. */
export const PAID_API_DAILY_LIMIT = envInt('VITE_PAID_API_DAILY_LIMIT', 200);

function buildApiLimit(
  api: PaidApiId,
  defaults: PaidApiLimit,
): PaidApiLimit {
  const prefix = `VITE_PAID_API_${api.toUpperCase().replace(/-/g, '_')}`;
  return {
    perSession: envInt(`${prefix}_SESSION`, defaults.perSession),
    perHour: envInt(`${prefix}_HOUR`, defaults.perHour),
  };
}

/**
 * Per-API burst caps — isolated so one provider can't starve others.
 * Daily cap is the main budget; these stop hammering within a session/hour.
 */
export const PAID_API_LIMITS: Record<PaidApiId, PaidApiLimit> = {
  bdl: buildApiLimit('bdl', { perSession: 60, perHour: 45 }),
  odds: buildApiLimit('odds', { perSession: 80, perHour: 60 }),
  sgo: buildApiLimit('sgo', { perSession: 50, perHour: 40 }),
  sports: buildApiLimit('sports', { perSession: 60, perHour: 45 }),
  'sports-basketball': buildApiLimit('sports-basketball', { perSession: 60, perHour: 45 }),
};

const hourlyCounts = new Map<PaidApiId, { count: number; windowStart: number }>();
export const HOUR_MS = 3_600_000;

function getHourlyCount(api: PaidApiId): number {
  const now = Date.now();
  const entry = hourlyCounts.get(api);
  if (!entry || now - entry.windowStart >= HOUR_MS) {
    hourlyCounts.set(api, { count: 0, windowStart: now });
    return 0;
  }
  return entry.count;
}

export function trackPaidApiHourly(api: PaidApiId): void {
  const now = Date.now();
  const entry = hourlyCounts.get(api);
  if (!entry || now - entry.windowStart >= HOUR_MS) {
    hourlyCounts.set(api, { count: 1, windowStart: now });
    return;
  }
  entry.count += 1;
}

export interface PaidApiGateResult {
  allowed: boolean;
  reason?: string;
  sessionCount: number;
  hourlyCount: number;
  dailyCount: number;
  dailyLimit: number;
  limit: PaidApiLimit;
}

/**
 * Gate paid upstream calls — free sources (ESPN, Action Network) always run first.
 * Blocks only when burst or daily budget is exhausted; returns null upstream (graceful degrade).
 */
export function canUsePaidApi(api: PaidApiId): PaidApiGateResult {
  const limit = PAID_API_LIMITS[api];
  const { byApi } = getPaidApiSessionCounts();
  const sessionCount = byApi[api] ?? 0;
  const hourlyCount = getHourlyCount(api);
  const dailyCount = getPaidApiDailyCount();

  const base = { sessionCount, hourlyCount, dailyCount, dailyLimit: PAID_API_DAILY_LIMIT, limit };

  if (dailyCount >= PAID_API_DAILY_LIMIT) {
    return {
      ...base,
      allowed: false,
      reason: `daily limit reached (${dailyCount}/${PAID_API_DAILY_LIMIT}) — resets at midnight; free feeds still work`,
    };
  }

  if (sessionCount >= limit.perSession) {
    return {
      ...base,
      allowed: false,
      reason: `session limit reached for ${api} (${sessionCount}/${limit.perSession}) — other paid APIs still available`,
    };
  }

  if (hourlyCount >= limit.perHour) {
    return {
      ...base,
      allowed: false,
      reason: `hourly limit reached for ${api} (${hourlyCount}/${limit.perHour}) — try again soon`,
    };
  }

  return { ...base, allowed: true };
}

/** Track daily usage when a paid call is approved (called from resilientFetch). */
export function recordPaidApiGatePass(api: PaidApiId): void {
  trackPaidApiDaily(api);
}

export function resetPaidKillSwitch(): void {
  hourlyCounts.clear();
  resetPaidApiDailyCounts();
}

/** Test hook — seed hourly window without waiting. */
export function __setHourlyWindowForTest(
  api: PaidApiId,
  count: number,
  windowStart: number,
): void {
  hourlyCounts.set(api, { count, windowStart });
}

declare global {
  interface Window {
    __siyfPaidKillSwitch?: {
      canUse: typeof canUsePaidApi;
      limits: typeof PAID_API_LIMITS;
      dailyLimit: number;
      getDaily: typeof getPaidApiDailyCounts;
      reset: typeof resetPaidKillSwitch;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__siyfPaidKillSwitch = {
    canUse: canUsePaidApi,
    limits: PAID_API_LIMITS,
    dailyLimit: PAID_API_DAILY_LIMIT,
    getDaily: getPaidApiDailyCounts,
    reset: resetPaidKillSwitch,
  };
}

export { getPaidApiDailyCounts, loadPaidApiDailyRecord };
