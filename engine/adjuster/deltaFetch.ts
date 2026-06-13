import type { Game } from '../../types';
import { getGameChronoRecord } from './chronoState';

/**
 * When every live game is in PRESENT_LIVE, skip heavy scoreboard enrichment
 * (RSS, odds, missing-context) — delta-only polling path.
 */
export function shouldSkipScoreboardEnrichment(games: Game[]): boolean {
  const live = games.filter((g) => g.statusState === 'in');
  if (!live.length) return false;

  return live.every((g) => {
    const record = getGameChronoRecord(g.id);
    const state = record?.committedState ?? 'PRESENT_LIVE';
    return state === 'PRESENT_LIVE';
  });
}
