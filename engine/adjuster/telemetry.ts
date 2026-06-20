import { engineLogWarn } from '../../config/engineLog';
import type { ParseInvariantIssue } from './invariants';

export interface ParseBatchMetrics {
  sport: string;
  rawCount: number;
  parsedCount: number;
  skippedCount: number;
  issueCount: number;
  errorCount: number;
  parseRate: number;
  timestamp: number;
}

export interface ParseDriftAlert {
  sport: string;
  kind: 'low_parse_rate' | 'invariant_errors' | 'high_skip_rate';
  message: string;
  metrics: ParseBatchMetrics;
  topIssues: ParseInvariantIssue[];
}

const batchHistory: ParseBatchMetrics[] = [];
const driftAlerts: ParseDriftAlert[] = [];
const MAX_HISTORY = 100;
const MAX_ALERTS = 50;

export { PARSE_RATE_ERROR_THRESHOLD, PARSE_RATE_WARN_THRESHOLD } from './metrics';

export function recordBatchMetrics(metrics: ParseBatchMetrics): void {
  batchHistory.push(metrics);
  if (batchHistory.length > MAX_HISTORY) batchHistory.shift();
}

export function recordDriftAlert(alert: ParseDriftAlert): void {
  driftAlerts.push(alert);
  if (driftAlerts.length > MAX_ALERTS) driftAlerts.shift();
  engineLogWarn(`[parse-drift] ${alert.sport}: ${alert.message}`, {
    parseRate: alert.metrics.parseRate,
    issues: alert.topIssues.slice(0, 3).map((i) => i.code),
  });
}

export function getParseBatchHistory(sport?: string): ParseBatchMetrics[] {
  if (!sport) return [...batchHistory];
  return batchHistory.filter((m) => m.sport === sport);
}

export function getParseDriftAlerts(sport?: string): ParseDriftAlert[] {
  if (!sport) return [...driftAlerts];
  return driftAlerts.filter((a) => a.sport === sport);
}

export function resetParseTelemetry(): void {
  batchHistory.length = 0;
  driftAlerts.length = 0;
}

declare global {
  interface Window {
    __siyfParseAdjuster?: {
      getHistory: typeof getParseBatchHistory;
      getAlerts: typeof getParseDriftAlerts;
      reset: typeof resetParseTelemetry;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__siyfParseAdjuster = {
    getHistory: getParseBatchHistory,
    getAlerts: getParseDriftAlerts,
    reset: resetParseTelemetry,
  };
}
