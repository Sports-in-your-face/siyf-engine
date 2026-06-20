import { engineLogInfo } from '../../config/engineLog';

export type PaidApiId = 'bdl' | 'odds' | 'sgo' | 'sports' | 'sports-basketball';

const counts: Record<PaidApiId, number> = {
  bdl: 0,
  odds: 0,
  sgo: 0,
  sports: 0,
  'sports-basketball': 0,
};

let sessionTotal = 0;

export function detectPaidApi(url: string): PaidApiId | null {
  const lower = url.toLowerCase();
  if (lower.includes('/api/bdl')) return 'bdl';
  if (lower.includes('/api/odds')) return 'odds';
  if (lower.includes('/api/sgo')) return 'sgo';
  if (lower.includes('/api/basketball')) return 'sports-basketball';
  if (lower.includes('/api/sports')) return 'sports';
  return null;
}

function formatBreakdown(): string {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([api, n]) => `${api}: ${n}`)
    .join(', ');
}

export function trackPaidApiUse(api: PaidApiId, reason?: string): void {
  counts[api] += 1;
  sessionTotal += 1;
  const breakdown = formatBreakdown();
  engineLogInfo(
    `[paid-api-used] ${api}${reason ? ` (${reason})` : ''} — call #${sessionTotal}${breakdown ? ` | ${breakdown}` : ''}`,
  );
}

export function getPaidApiSessionCounts(): { total: number; byApi: Readonly<Record<PaidApiId, number>> } {
  return { total: sessionTotal, byApi: { ...counts } };
}

export function resetPaidApiSessionCounts(): void {
  for (const key of Object.keys(counts) as PaidApiId[]) counts[key] = 0;
  sessionTotal = 0;
}

declare global {
  interface Window {
    __siyfPaidApi?: {
      getCounts: typeof getPaidApiSessionCounts;
      reset: typeof resetPaidApiSessionCounts;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__siyfPaidApi = {
    getCounts: getPaidApiSessionCounts,
    reset: resetPaidApiSessionCounts,
  };
}
