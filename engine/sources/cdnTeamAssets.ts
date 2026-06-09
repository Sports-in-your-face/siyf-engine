import { APP_SPORT_TO_CDN, type CdnTeamSport } from '../../config/siyfCdn';
import { shouldUseNbaTeamCdn } from '../../utils/coerce';
import type { Team } from '../../types';
import type { SportType } from '../../services/api';
import type { ResolvedTeam } from '../core/types';
import {
  ensureTeamRegistry,
  enrichMlbTeam,
  enrichNflTeam,
  enrichSoccerTeam,
  enrichTeam,
  getAllMlbTeams,
  getAllNhlTeams,
  getAllNflTeams,
  getAllSoccerTeams,
  getAllTeams,
  resolveMlbTeamLogo,
  resolveNflTeamLogo,
  resolveNhlTeamLogo,
  resolveSoccerTeamLogo,
  resolveTeamLogo,
} from './teamRegistry';

const REGISTRY_GETTERS: Record<CdnTeamSport, () => ResolvedTeam[]> = {
  nba: getAllTeams,
  nfl: getAllNflTeams,
  epl: getAllSoccerTeams,
  mlb: getAllMlbTeams,
  nhl: getAllNhlTeams,
};

const LOGO_RESOLVERS: Record<CdnTeamSport, (abbr: string, existing?: string) => string> = {
  nba: resolveTeamLogo,
  nfl: resolveNflTeamLogo,
  epl: resolveSoccerTeamLogo,
  mlb: resolveMlbTeamLogo,
  nhl: resolveNhlTeamLogo,
};

const TEAM_ENRICHERS: Record<CdnTeamSport, (abbr: string, partial: Partial<ResolvedTeam> & { name?: string; logo?: string }) => ResolvedTeam> = {
  nba: enrichTeam,
  nfl: enrichNflTeam,
  epl: enrichSoccerTeam,
  mlb: enrichMlbTeam,
  nhl: (abbr, partial) => ({
    id: partial.id ?? abbr,
    name: partial.name ?? abbr,
    abbr,
    city: partial.city ?? '',
    logo: LOGO_RESOLVERS.nhl(abbr, partial.logo),
    color: partial.color,
    alternateColor: partial.alternateColor,
  }),
};

export function cdnKeyForSport(sport: string): CdnTeamSport | undefined {
  return APP_SPORT_TO_CDN[sport];
}

export async function ensureCdnTeamsForSport(sport: string): Promise<CdnTeamSport | undefined> {
  const key = cdnKeyForSport(sport);
  if (!key) return undefined;
  await ensureTeamRegistry(key);
  return key;
}

export async function loadCdnTeamsForSport(sport: string): Promise<ResolvedTeam[]> {
  const key = await ensureCdnTeamsForSport(sport);
  if (!key) return [];
  return REGISTRY_GETTERS[key]() ?? [];
}

export function resolveLogoForSport(sport: string, abbr: string, existing?: string): string {
  const key = cdnKeyForSport(sport);
  if (!key) return existing ?? '';
  return LOGO_RESOLVERS[key](abbr, existing);
}

/** Prefer CDN registry assets; keep ESPN as fallback when no CDN match. */
export function enrichParsedTeamFromCdn(
  sport: SportType | undefined,
  team: Team,
  gameSport?: string,
): Team {
  const key = sport ? cdnKeyForSport(sport) : undefined;
  if (!key) return team;
  if (sport === 'BASKETBALL' && gameSport && !shouldUseNbaTeamCdn({ sport: gameSport })) {
    return team;
  }

  const originalLogo = team.logo;
  const enriched = TEAM_ENRICHERS[key](team.abbr, {
    name: team.name,
    logo: team.logo,
    color: team.color,
    alternateColor: team.alternateColor,
  });

  const logo = enriched.logo || originalLogo;
  const logoFallback =
    originalLogo && logo && originalLogo !== logo ? originalLogo : team.logoFallback;

  return {
    ...team,
    name: enriched.name,
    abbr: enriched.abbr,
    logo,
    logoFallback,
    color: enriched.color ?? team.color,
    alternateColor: enriched.alternateColor ?? team.alternateColor,
  };
}

export function enrichGameTeamsFromCdn(sport: SportType, game: import('../../types').Game): import('../../types').Game {
  const gs = game.sport;
  return {
    ...game,
    away: enrichParsedTeamFromCdn(sport, game.away, gs),
    home: enrichParsedTeamFromCdn(sport, game.home, gs),
  };
}

export function enrichGamesTeamsFromCdn(sport: SportType, games: import('../../types').Game[]): import('../../types').Game[] {
  return games.map((g) => enrichGameTeamsFromCdn(sport, g));
}
