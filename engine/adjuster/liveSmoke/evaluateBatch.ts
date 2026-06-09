import type { Game } from '../../../types';
import type { ParseBatchReport } from '../adjuster';
import { hasBlockingIssues, validateGames } from '../invariants';
import { getSportParseThreshold } from '../metrics';

/** Evaluate parse health without writing telemetry (safe for multi-source smoke loops). */
export function evaluateParseBatch(
  sport: string,
  games: Game[],
  rawCount: number,
  skipped: number,
): ParseBatchReport {
  const parsedCount = games.length;
  const parseRate = rawCount > 0 ? parsedCount / rawCount : 1;
  const issues = validateGames(games, sport);
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const thresholds = getSportParseThreshold(sport);

  return {
    metrics: {
      sport,
      rawCount,
      parsedCount,
      skippedCount: skipped,
      issueCount: issues.length,
      errorCount,
      parseRate,
      timestamp: Date.now(),
    },
    issues,
    alerts: [],
    healthy: parseRate >= thresholds.warnParseRate && !hasBlockingIssues(issues),
  };
}
