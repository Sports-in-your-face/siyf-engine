import type { Game } from '../../types';
import { enrichTeam, normalizeTeamAbbr, resolveTeamLogo } from '../sources/teamRegistry';

function dedupeKey(game: Game): string {
  return game.leagueSlug ? `${game.leagueSlug}:${game.id}` : game.id;
}

const STATUS_PRIORITY: Record<string, number> = { in: 0, pre: 1, post: 2 };

function pickPreferredGame(existing: Game, candidate: Game): Game {
  const existingRank = STATUS_PRIORITY[existing.statusState ?? 'pre'] ?? 1;
  const candidateRank = STATUS_PRIORITY[candidate.statusState ?? 'pre'] ?? 1;
  return candidateRank < existingRank ? candidate : existing;
}

/** Drop duplicate scoreboard rows — keeps the best row per league/id (live wins ties). */
export function dedupeGamesById(games: Game[]): Game[] {
  const map = new Map<string, Game>();
  for (const game of games) {
    const key = dedupeKey(game);
    const existing = map.get(key);
    map.set(key, existing ? pickPreferredGame(existing, game) : game);
  }
  return Array.from(map.values());
}

/** Stable React list key — disambiguates tours/leagues that share ESPN ids. */
export function gameListKey(game: Game, tab?: string): string {
  const scope = game.leagueSlug ?? game.sport ?? '';
  return scope ? `${tab ?? ''}-${scope}-${game.id}` : `${tab ?? ''}-${game.id}`;
}

export function gameMatchKey(awayAbbr: string, homeAbbr: string): string {
  const a = normalizeTeamAbbr(awayAbbr);
  const h = normalizeTeamAbbr(homeAbbr);
  return `${a}@${h}`;
}

function parseScoreNum(score: number | string | null | undefined): number | null {
  if (score === null || score === undefined || score === '') return null;
  const n = typeof score === 'number' ? score : parseInt(String(score), 10);
  return Number.isNaN(n) ? null : n;
}

function pickBetterScore(a: number | string | null, b: number | string | null, live: boolean): number | string | null {
  if (!live) return a ?? b;
  const na = parseScoreNum(a);
  const nb = parseScoreNum(b);
  if (na !== null && nb !== null) return Math.max(na, nb);
  return na ?? nb ?? a ?? b;
}

function enrichSide(side: Game['away']): Game['away'] {
  const reg = enrichTeam(side.abbr, {
    name: side.name,
    logo: side.logo,
    color: side.color,
    alternateColor: side.alternateColor,
  });
  return {
    ...side,
    name: side.name || reg.name,
    abbr: reg.abbr,
    logo: resolveTeamLogo(reg.abbr, side.logo ?? reg.logo),
    color: side.color ?? reg.color,
    alternateColor: side.alternateColor ?? reg.alternateColor,
  };
}

/** Merge ESPN + BDL games by matchup — prefer ESPN structure, freshest live scores */
export function mergeScoreboardGames(espnGames: Game[], bdlGames: Game[]): Game[] {
  const map = new Map<string, Game>();

  for (const game of espnGames) {
    const key = gameMatchKey(game.away.abbr, game.home.abbr);
    map.set(key, {
      ...game,
      away: enrichSide(game.away),
      home: enrichSide(game.home),
    });
  }

  for (const bdlGame of bdlGames) {
    const key = gameMatchKey(bdlGame.away.abbr, bdlGame.home.abbr);
    const existing = map.get(key);
    const live = bdlGame.statusState === 'in' || existing?.statusState === 'in';

    if (!existing) {
      map.set(key, {
        ...bdlGame,
        away: enrichSide(bdlGame.away),
        home: enrichSide(bdlGame.home),
      });
      continue;
    }

    map.set(key, {
      ...existing,
      away: {
        ...existing.away,
        score: pickBetterScore(existing.away.score, bdlGame.away.score, live),
        record: existing.away.record ?? bdlGame.away.record,
        linescores: existing.away.linescores?.length ? existing.away.linescores : bdlGame.away.linescores,
      },
      home: {
        ...existing.home,
        score: pickBetterScore(existing.home.score, bdlGame.home.score, live),
        record: existing.home.record ?? bdlGame.home.record,
        linescores: existing.home.linescores?.length ? existing.home.linescores : bdlGame.home.linescores,
      },
      status: live && bdlGame.statusState === 'in' ? bdlGame.status : existing.status,
      statusState: live ? (bdlGame.statusState === 'in' ? 'in' : existing.statusState) : existing.statusState,
      topPerformers: existing.topPerformers?.length ? existing.topPerformers : bdlGame.topPerformers,
      context: existing.context ?? bdlGame.context,
      subtitle: existing.subtitle ?? bdlGame.subtitle,
      timing: existing.timing ?? bdlGame.timing,
      clock: live && bdlGame.statusState === 'in' && bdlGame.clock
        ? bdlGame.clock
        : (existing.timing ? existing.clock : (bdlGame.timing ? bdlGame.clock : existing.clock)),
    });
  }

  return Array.from(map.values()).sort((a, b) => {
    const order = { in: 0, pre: 1, post: 2 };
    const sa = order[a.statusState ?? 'pre'] ?? 1;
    const sb = order[b.statusState ?? 'pre'] ?? 1;
    if (sa !== sb) return sa - sb;
    return 0;
  });
}

export function findBdlGameId(
  bdlGames: { id: number; visitor_team: { abbreviation: string }; home_team: { abbreviation: string } }[],
  awayAbbr: string,
  homeAbbr: string,
): number | undefined {
  const key = gameMatchKey(awayAbbr, homeAbbr);
  const match = bdlGames.find(
    (g) => gameMatchKey(g.visitor_team.abbreviation, g.home_team.abbreviation) === key,
  );
  return match?.id;
}
