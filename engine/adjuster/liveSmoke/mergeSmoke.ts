import type { Game } from '../../../types';
import type { EngineSport } from '../../sportConfig';
import { gameMatchKey, mergeScoreboardGames } from '../../core/mergeGames';
import { mapActionNetworkGames, type AnScoreboardResponse } from '../../sources/actionNetworkSource';
import { validateMergeHealth, type MergeHealthInput } from '../invariants/merge';
import type { ParseInvariantIssue } from '../invariants/types';
import { parseEspnSource } from './parseSource';
import type { SportType } from '../../../services/api';
import { evaluateParseBatch } from './evaluateBatch';

export interface MergeSmokeResult {
  id: string;
  sport: EngineSport;
  espnGames: Game[];
  anGames: Game[];
  merged: Game[];
  mergeIssues: ParseInvariantIssue[];
  report: ReturnType<typeof evaluateParseBatch>;
  healthy: boolean;
}

export function simulateEspnActionNetworkMerge(
  id: string,
  sport: SportType,
  espnRaw: unknown,
  anRaw: unknown,
  anLeague: string,
): MergeSmokeResult {
  const espn = parseEspnSource(sport, espnRaw);
  const an = mapActionNetworkGames((anRaw ?? {}) as AnScoreboardResponse, anLeague);
  const merged = mergeScoreboardGames(espn.games, an);

  const mergeInput: MergeHealthInput = {
    primary: espn.games,
    secondary: an,
    merged,
    secondaryLabel: 'action-network',
  };
  const mergeIssues = validateMergeHealth(mergeInput);
  const report = evaluateParseBatch(sport, merged, espn.rawCount, espn.skipped);
  const blockingMerge = mergeIssues.some((i) => i.severity === 'error');

  return {
    id,
    sport: sport as EngineSport,
    espnGames: espn.games,
    anGames: an,
    merged,
    mergeIssues,
    report,
    healthy: report.healthy && !blockingMerge,
  };
}

export function countMergeMatches(primary: Game[], secondary: Game[]): number {
  const keys = new Set(primary.map((g) => gameMatchKey(g.away.abbr, g.home.abbr)));
  return secondary.filter((g) => keys.has(gameMatchKey(g.away.abbr, g.home.abbr))).length;
}
