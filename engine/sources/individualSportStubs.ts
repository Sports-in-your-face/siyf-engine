import type { Player, PlayerDetails } from '../../types';
import type { ResolvedTeam, StandingsGroup } from '../core/types';
import type { EnrichmentOps } from '../sportConfig';

export const noopTeams = {
  enrichTeam: (abbr: string, partial: object): ResolvedTeam => ({
    id: abbr,
    abbr,
    name: abbr,
    city: '',
    logo: '',
    ...(partial as object),
  } as ResolvedTeam),
  resolveLogo: (_abbr: string, existing?: string) => existing ?? '',
  getAllTeams: () => [] as ResolvedTeam[],
};

export const noopEnrichment: EnrichmentOps = {
  enrichGamesFromRss: async (games) => games,
  enrichGamesWithOdds: async (games) => games,
  enrichTeamsWithNotes: async (teams) => teams,
  enrichRosterWithInjuries: async (roster) => roster,
  fetchFanDuelTopPerformers: async () => null,
};

export function buildIndividualPlayerDetails(
  player: Player,
  _heroStatOrder: string[],
): PlayerDetails {
  return {
    id: player.id,
    name: player.name,
    team: player.team,
    position: player.position,
    number: player.number,
    height: player.height,
    weight: player.weight,
    headshot: player.headshot,
    teamAccent: player.teamAccent,
    heroStats: player.stats.slice(0, 8),
    seasonSplits: player.stats.length ? [{ name: 'Season', stats: player.stats }] : [],
    seasonHistory: [],
    recentGames: [],
    awards: [],
  };
}

export function emptyStandings(): StandingsGroup[] {
  return [];
}
