import type { Game, Team } from '../../types';

/** Yahoo scoreboard rows use synthetic ids — never send to ESPN summary APIs. */
export function isYahooSourcedGameId(id: string | undefined): boolean {
  return Boolean(id?.startsWith('yahoo-'));
}

/** Team-sport ESPN summary endpoints expect numeric event ids. */
export function isEspnNumericEventId(id: string | undefined): boolean {
  return Boolean(id && /^\d+$/.test(id));
}

export function canFetchEspnTeamSummary(game: Pick<Game, 'id'>): boolean {
  return isEspnNumericEventId(game.id);
}

export function guardedEspnTeamSummaryEventId(game: Pick<Game, 'id'>): string | null {
  if (isYahooSourcedGameId(game.id)) return null;
  if (!isEspnNumericEventId(game.id)) return null;
  return game.id;
}

/** ESPN team/roster endpoints expect numeric ids (not Yahoo `soccer.t.*`). */
export function isEspnNumericTeamId(id: string | undefined): boolean {
  return Boolean(id && /^\d+$/.test(id));
}

/** Minimal ESPN summary shape for pre-game roster fetch when summary API fails. */
export function buildPreGameSummaryStub(away: Team, home: Team): unknown | null {
  const awayId = isEspnNumericTeamId(away.id) ? away.id : null;
  const homeId = isEspnNumericTeamId(home.id) ? home.id : null;
  if (!awayId || !homeId) return null;
  return {
    header: {
      competitions: [{
        competitors: [
          { homeAway: 'away', team: { id: awayId } },
          { homeAway: 'home', team: { id: homeId } },
        ],
      }],
    },
    leaders: [],
  };
}

export function resolveTeamIdsFromRegistry(
  away: Team,
  home: Team,
  lookup: (abbr: string) => { id?: string } | undefined,
): { away: Team; home: Team } {
  const pickId = (team: Team): string | undefined => {
    if (isEspnNumericTeamId(team.id)) return team.id;
    const fromRegistry = lookup(team.abbr)?.id;
    if (isEspnNumericTeamId(fromRegistry)) return fromRegistry;
    return team.id;
  };
  return {
    away: { ...away, id: pickId(away) },
    home: { ...home, id: pickId(home) },
  };
}
