import type { Game } from '../../types';
import type { EngineSport } from '../sportConfig';
import { parseDisplayScore } from '../../utils/coerce';
import {
  enrichTeamForSport,
  normalizeAbbrForSport,
  normalizeTeamAbbr,
  resolveTeamLogoForSport,
} from '../sources/teamRegistry';

/** Scope key for dedupeGamesById — disambiguates WNBA/NCAA and multi-league soccer ids. */
export function gameDedupeKey(game: Game): string {
  if (game.leagueSlug) return `${game.leagueSlug}:${game.id}`;
  const sport = (game.sport ?? '').toUpperCase();
  if (sport === 'WNBA' || sport === 'NCAA') return `${sport}:${game.id}`;
  return game.id;
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
    const key = gameDedupeKey(game);
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

export function inferEngineSportFromGame(game: Game): EngineSport | undefined {
  const s = (game.sport ?? '').toUpperCase();
  if (s === 'MLB' || s === 'BASEBALL') return 'BASEBALL';
  if (s === 'NFL' || s === 'FOOTBALL') return 'FOOTBALL';
  if (s === 'NHL' || s === 'HOCKEY') return 'HOCKEY';
  if (s === 'NBA' || s === 'BASKETBALL') return 'BASKETBALL';
  if (s === 'SOCCER') return 'SOCCER';
  return undefined;
}

export function gameMatchKey(awayAbbr: string, homeAbbr: string, sport?: EngineSport): string {
  const a = sport ? normalizeAbbrForSport(sport, awayAbbr) : normalizeTeamAbbr(awayAbbr);
  const h = sport ? normalizeAbbrForSport(sport, homeAbbr) : normalizeTeamAbbr(homeAbbr);
  return `${a}@${h}`;
}

function parseScoreNum(score: number | string | null | undefined): number | null {
  const parsed = parseDisplayScore(score);
  if (parsed === null || parsed === '') return null;
  const n = typeof parsed === 'number' ? parsed : parseInt(String(parsed), 10);
  return Number.isNaN(n) ? null : n;
}

function pickBetterScore(a: number | string | null, b: number | string | null, live: boolean): number | string | null {
  if (!live) return a ?? b;
  const na = parseScoreNum(a);
  const nb = parseScoreNum(b);
  if (na !== null && nb !== null) return Math.max(na, nb);
  return na ?? nb ?? a ?? b;
}

function enrichSide(side: Game['away'], game: Game, sport: EngineSport): Game['away'] {
  const gs = (game.sport ?? '').toUpperCase();
  if (gs === 'WNBA' || gs === 'NCAA') return side;

  const reg = enrichTeamForSport(sport, side.abbr, {
    name: side.name,
    logo: side.logo,
    color: side.color,
    alternateColor: side.alternateColor,
  });
  return {
    ...side,
    name: side.name || reg.name,
    abbr: reg.abbr,
    logo: resolveTeamLogoForSport(sport, reg.abbr, side.logo ?? reg.logo),
    color: side.color ?? reg.color,
    alternateColor: side.alternateColor ?? reg.alternateColor,
  };
}

/** Merge ESPN + supplemental games by matchup — prefer ESPN structure, freshest live scores. */
export function mergeScoreboardGames(
  espnGames: Game[],
  supplementalGames: Game[],
  sport: EngineSport = 'BASKETBALL',
): Game[] {
  const map = new Map<string, Game>();

  for (const game of espnGames) {
    const mergeSport = inferEngineSportFromGame(game) ?? sport;
    const key = gameMatchKey(game.away.abbr, game.home.abbr, mergeSport);
    map.set(key, {
      ...game,
      away: enrichSide(game.away, game, mergeSport),
      home: enrichSide(game.home, game, mergeSport),
    });
  }

  for (const extra of supplementalGames) {
    const mergeSport = inferEngineSportFromGame(extra) ?? sport;
    const key = gameMatchKey(extra.away.abbr, extra.home.abbr, mergeSport);
    const existing = map.get(key);
    const live = extra.statusState === 'in' || existing?.statusState === 'in';

    if (!existing) {
      map.set(key, {
        ...extra,
        away: enrichSide(extra.away, extra, mergeSport),
        home: enrichSide(extra.home, extra, mergeSport),
      });
      continue;
    }

    map.set(key, {
      ...existing,
      away: {
        ...existing.away,
        score: pickBetterScore(existing.away.score, extra.away.score, live),
        record: existing.away.record ?? extra.away.record,
        linescores: existing.away.linescores?.length ? existing.away.linescores : extra.away.linescores,
      },
      home: {
        ...existing.home,
        score: pickBetterScore(existing.home.score, extra.home.score, live),
        record: existing.home.record ?? extra.home.record,
        linescores: existing.home.linescores?.length ? existing.home.linescores : extra.home.linescores,
      },
      status: live && extra.statusState === 'in' ? extra.status : existing.status,
      statusState: live ? (extra.statusState === 'in' ? 'in' : existing.statusState) : existing.statusState,
      topPerformers: existing.topPerformers?.length ? existing.topPerformers : extra.topPerformers,
      context: existing.context ?? extra.context,
      subtitle: existing.subtitle ?? extra.subtitle,
      timing: existing.timing ?? extra.timing,
      clock: live && extra.statusState === 'in' && extra.clock
        ? extra.clock
        : (existing.timing ? existing.clock : (extra.timing ? extra.clock : existing.clock)),
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
  const key = gameMatchKey(awayAbbr, homeAbbr, 'BASKETBALL');
  const match = bdlGames.find(
    (g) => gameMatchKey(g.visitor_team.abbreviation, g.home_team.abbreviation, 'BASKETBALL') === key,
  );
  return match?.id;
}
