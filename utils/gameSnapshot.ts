import type { Game } from '../types';
import { displayScoreValue } from './gameDisplay';

/** Compact fingerprint for scoreboard-level changes (scores, clock, status). */
export function gameScoreboardFingerprint(game: Game): string {
  return [
    game.id,
    game.statusState,
    game.status,
    game.clock ?? '',
    displayScoreValue(game.home.score),
    displayScoreValue(game.away.score),
    game.context?.headline ?? '',
    game.context?.badge ?? '',
    game.subtitle ?? '',
  ].join('|');
}

export function gamesSnapshotEqual(a: Game[], b: Game[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((g) => [g.id, g]));
  for (const game of a) {
    const other = byId.get(game.id);
    if (!other) return false;
    if (gameScoreboardFingerprint(game) !== gameScoreboardFingerprint(other)) return false;
  }
  return true;
}

export function gameNeedsDetailRefresh(prev: Game, next: Game): boolean {
  return gameScoreboardFingerprint(prev) !== gameScoreboardFingerprint(next);
}
