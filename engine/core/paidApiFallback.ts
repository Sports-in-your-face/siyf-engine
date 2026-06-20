import type { Game } from '../../types';
import type { EngineSport } from '../sportConfig';
import { createEngineLog, safeTryAsync } from './engineUtils';
import type { DataSource } from './types';

const log = createEngineLog('paid-api-fallback');
import { gameMissingScores, shouldFetchBdlScoreboard } from './paidApiPolicy';
import {
  fetchActionNetworkScoreboard,
  getActionNetworkLeague,
  mapActionNetworkGames,
  mergeActionNetworkScoreboard,
  supportsActionNetwork,
} from '../sources/actionNetworkSource';
import { bdlGames, mapBdlGames } from '../sources/ballDontLieSource';
import { mergeScoreboardGames } from './mergeGames';

/** Action Network — free scores, broadcast, linescores, and odds for US team sports. */
export async function tryActionNetworkScores(
  sport: EngineSport,
  games: Game[],
  sources: DataSource[],
): Promise<{ games: Game[]; sources: DataSource[] }> {
  if (!supportsActionNetwork(sport)) return { games, sources };

  const result = await safeTryAsync(
    log,
    'tryActionNetworkScores',
    sport,
    async () => {
      const league = getActionNetworkLeague(sport);
      if (!league) return null;

      const raw = await fetchActionNetworkScoreboard(league);
      const anList = mapActionNetworkGames(raw ?? {}, league);
      if (!anList.length) return null;

      return {
        games: mergeScoreboardGames(games, anList, sport),
        sources: sources.includes('action-network') ? sources : [...sources, 'action-network'],
      };
    },
    null,
  );
  return result ?? { games, sources };
}

/** BDL scoreboard — paid last resort for NBA scores. */
export async function tryBdlScoreboard(
  games: Game[],
  sources: DataSource[],
): Promise<{ games: Game[]; sources: DataSource[] }> {
  if (!shouldFetchBdlScoreboard(games)) return { games, sources };

  const result = await safeTryAsync(
    log,
    'tryBdlScoreboard',
    'basketball',
    async () => {
      const today = new Date().toISOString().split('T')[0];
      const bdlRaw = await bdlGames(today);
      if (!bdlRaw?.data?.length) return null;
      const bdlList = mapBdlGames(bdlRaw.data);
      return {
        games: mergeScoreboardGames(games, bdlList),
        sources: sources.includes('balldontlie') ? sources : [...sources, 'balldontlie'],
      };
    },
    null,
  );
  return result ?? { games, sources };
}

/** Action Network first, then BDL for NBA only. */
export async function enrichTeamSportScoreboard(
  sport: EngineSport,
  games: Game[],
  sources: DataSource[],
): Promise<{ games: Game[]; sources: DataSource[] }> {
  let next = await tryActionNetworkScores(sport, games, sources);
  if (sport === 'BASKETBALL') {
    next = await tryBdlScoreboard(next.games, next.sources);
  }
  return next;
}

/** Patch live game scores/broadcast from Action Network after ESPN. */
export async function patchLiveScoresFromActionNetwork(
  game: Game,
  sport: EngineSport,
): Promise<Game | null> {
  if (!supportsActionNetwork(sport)) return null;
  if (!gameMissingScores(game) && game.broadcast) return null;

  const merged = await mergeActionNetworkScoreboard(sport, [game]);
  const patched = merged[0];
  if (!patched) return null;

  const scoresChanged =
    gameMissingScores(game)
    && patched.away.score != null
    && patched.home.score != null;
  const broadcastAdded = !game.broadcast && Boolean(patched.broadcast);

  if (!scoresChanged && !broadcastAdded) return null;
  return patched;
}

export function supportsActionNetworkScoreFallback(sport: EngineSport): boolean {
  return supportsActionNetwork(sport);
}
