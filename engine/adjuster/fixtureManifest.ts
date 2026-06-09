import type { SportType } from '../../services/api';

export type FixtureParserKind = 'team' | 'tennis' | 'golf' | 'fight';

export interface GoldenFixtureEntry {
  id: string;
  sport: SportType;
  parser: FixtureParserKind;
  /** Path relative to __fixtures__/ */
  file: string;
  /** Expected minimum games parsed from this single event */
  minGames: number;
  /** Optional expected sport tag on parsed game (WNBA, NCAA, etc.) */
  expectedGameSport?: string;
}

/** Curated golden corpus — extend when capturing new upstream shapes. */
export const GOLDEN_FIXTURES: GoldenFixtureEntry[] = [
  { id: 'basketball-live', sport: 'BASKETBALL', parser: 'team', file: 'basketball/live-standard.json', minGames: 1 },
  { id: 'basketball-score-object', sport: 'BASKETBALL', parser: 'team', file: 'basketball/score-object.json', minGames: 1 },
  { id: 'basketball-score-moved', sport: 'BASKETBALL', parser: 'team', file: 'basketball/score-moved.json', minGames: 1 },
  { id: 'basketball-wnba-names', sport: 'BASKETBALL', parser: 'team', file: 'basketball/wnba-team-names.json', minGames: 1, expectedGameSport: 'WNBA' },
  { id: 'basketball-wnba-meta', sport: 'BASKETBALL', parser: 'team', file: 'basketball/wnba-league-meta.json', minGames: 1, expectedGameSport: 'WNBA' },
  { id: 'football-scheduled', sport: 'FOOTBALL', parser: 'team', file: 'football/scheduled.json', minGames: 1 },
  { id: 'football-live-object', sport: 'FOOTBALL', parser: 'team', file: 'football/live-object-score.json', minGames: 1 },
  { id: 'soccer-epl-live', sport: 'SOCCER', parser: 'team', file: 'soccer/epl-live.json', minGames: 1 },
  { id: 'baseball-live', sport: 'BASEBALL', parser: 'team', file: 'baseball/live-standard.json', minGames: 1 },
  { id: 'hockey-live', sport: 'HOCKEY', parser: 'team', file: 'hockey/live-standard.json', minGames: 1 },
  { id: 'tennis-atp-match', sport: 'TENNIS', parser: 'tennis', file: 'tennis/atp-match.json', minGames: 1 },
  { id: 'golf-pga-tournament', sport: 'GOLF', parser: 'golf', file: 'golf/pga-tournament.json', minGames: 1 },
  { id: 'fights-ufc-pre', sport: 'FIGHTS', parser: 'fight', file: 'fights/ufc-bout-pre.json', minGames: 1 },
];
