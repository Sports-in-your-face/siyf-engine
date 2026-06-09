import type { CompetitorLayout } from '../../config/sportProfiles';

export interface SportParseThresholds {
  warnParseRate: number;
  errorParseRate: number;
  /** Minimum raw events before parse-rate drift alerts fire. */
  minRawForAlert: number;
  layout: CompetitorLayout;
}

const DEFAULT_THRESHOLDS: SportParseThresholds = {
  warnParseRate: 0.85,
  errorParseRate: 0.5,
  minRawForAlert: 3,
  layout: 'team',
};

/** Per-sport parse health gates — tune from live benchmarks in __benchmarks__/baseline.json */
export const SPORT_PARSE_THRESHOLDS: Record<string, SportParseThresholds> = {
  BASKETBALL: { warnParseRate: 0.9, errorParseRate: 0.5, minRawForAlert: 3, layout: 'team' },
  FOOTBALL: { warnParseRate: 0.9, errorParseRate: 0.5, minRawForAlert: 3, layout: 'team' },
  SOCCER: { warnParseRate: 0.85, errorParseRate: 0.45, minRawForAlert: 3, layout: 'team' },
  BASEBALL: { warnParseRate: 0.9, errorParseRate: 0.5, minRawForAlert: 3, layout: 'team' },
  HOCKEY: { warnParseRate: 0.9, errorParseRate: 0.5, minRawForAlert: 3, layout: 'team' },
  TENNIS: { warnParseRate: 0.7, errorParseRate: 0.4, minRawForAlert: 2, layout: 'matchup' },
  GOLF: { warnParseRate: 0.5, errorParseRate: 0.3, minRawForAlert: 1, layout: 'leaderboard' },
  FIGHTS: { warnParseRate: 0.6, errorParseRate: 0.35, minRawForAlert: 2, layout: 'fight' },
  WNBA: { warnParseRate: 0.85, errorParseRate: 0.45, minRawForAlert: 2, layout: 'team' },
  NCAA: { warnParseRate: 0.75, errorParseRate: 0.4, minRawForAlert: 2, layout: 'team' },
};

export function getSportParseThreshold(sport: string): SportParseThresholds {
  return SPORT_PARSE_THRESHOLDS[sport.toUpperCase()] ?? DEFAULT_THRESHOLDS;
}

/** @deprecated Use getSportParseThreshold(sport).warnParseRate */
export const PARSE_RATE_WARN_THRESHOLD = DEFAULT_THRESHOLDS.warnParseRate;

/** @deprecated Use getSportParseThreshold(sport).errorParseRate */
export const PARSE_RATE_ERROR_THRESHOLD = DEFAULT_THRESHOLDS.errorParseRate;
