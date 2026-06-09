import type { Game } from '../../types';
import {
  hasBlockingIssues,
  validateGame,
  validateGames,
  type ParseInvariantIssue,
} from './invariants';
import { getSportParseThreshold } from './metrics';
import {
  recordBatchMetrics,
  recordDriftAlert,
  type ParseBatchMetrics,
  type ParseDriftAlert,
} from './telemetry';

export interface ParseBatchInput {
  sport: string;
  rawCount: number;
  parsed: Game[];
  skipped: number;
}

export interface ParseBatchReport {
  metrics: ParseBatchMetrics;
  issues: ParseInvariantIssue[];
  alerts: ParseDriftAlert[];
  healthy: boolean;
}

function topIssueCodes(issues: ParseInvariantIssue[], limit = 5): ParseInvariantIssue[] {
  const seen = new Set<string>();
  const out: ParseInvariantIssue[] = [];
  for (const issue of issues) {
    if (seen.has(issue.code)) continue;
    seen.add(issue.code);
    out.push(issue);
    if (out.length >= limit) break;
  }
  return out;
}

/** Record a parse batch, run invariants, emit drift alerts. */
export function recordParseBatch(input: ParseBatchInput): ParseBatchReport {
  const { sport, rawCount, parsed, skipped } = input;
  const parsedCount = parsed.length;
  const parseRate = rawCount > 0 ? parsedCount / rawCount : 1;

  const issues = validateGames(parsed, sport);
  const errorCount = issues.filter((i) => i.severity === 'error').length;

  const metrics: ParseBatchMetrics = {
    sport,
    rawCount,
    parsedCount,
    skippedCount: skipped,
    issueCount: issues.length,
    errorCount,
    parseRate,
    timestamp: Date.now(),
  };

  recordBatchMetrics(metrics);

  const alerts: ParseDriftAlert[] = [];
  const thresholds = getSportParseThreshold(sport);

  if (rawCount >= thresholds.minRawForAlert && parseRate < thresholds.warnParseRate) {
    const kind = parseRate < thresholds.errorParseRate ? 'low_parse_rate' as const : 'high_skip_rate' as const;
    const alert: ParseDriftAlert = {
      sport,
      kind,
      message: `Parse rate ${(parseRate * 100).toFixed(0)}% (${parsedCount}/${rawCount}) — upstream schema may have drifted`,
      metrics,
      topIssues: topIssueCodes(issues),
    };
    recordDriftAlert(alert);
    alerts.push(alert);
  }

  if (errorCount > 0) {
    const alert: ParseDriftAlert = {
      sport,
      kind: 'invariant_errors',
      message: `${errorCount} invariant error(s) in parsed output`,
      metrics,
      topIssues: topIssueCodes(issues.filter((i) => i.severity === 'error')),
    };
    recordDriftAlert(alert);
    alerts.push(alert);
  }

  return {
    metrics,
    issues,
    alerts,
    healthy: parseRate >= thresholds.warnParseRate && !hasBlockingIssues(issues),
  };
}

/** Validate a single game after parse (lightweight inline check). */
export function auditParsedGame(game: Game): ParseInvariantIssue[] {
  return validateGame(game);
}

/** Build a drift report object for AI/human review (exportable JSON). */
export function buildDriftReport(reports: ParseBatchReport[]): string {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      summary: reports.map((r) => ({
        sport: r.metrics.sport,
        healthy: r.healthy,
        parseRate: r.metrics.parseRate,
        raw: r.metrics.rawCount,
        parsed: r.metrics.parsedCount,
        skipped: r.metrics.skippedCount,
        errors: r.metrics.errorCount,
        topIssues: r.alerts.flatMap((a) => a.topIssues.map((i) => i.code)),
      })),
      alerts: reports.flatMap((r) => r.alerts),
      issues: reports.flatMap((r) => r.issues).slice(0, 50),
    },
    null,
    2,
  );
}
