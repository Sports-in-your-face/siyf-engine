import { createEngineLog, safeTryAsync } from '../core/engineUtils';
import type { StandingsGroup } from '../core/types';
import {
  espnSoccerAthlete,
  espnSoccerSearchAthletes,
  espnSoccerStandings,
  espnSoccerTeamRoster,
  espnSoccerTeamSchedule,
} from './espnSoccerSource';
import { getActiveSoccerLeagueSlugs } from './soccerLeagues';
import { leagueLabel } from './teamRegistry';

const log = createEngineLog('soccer-league-ops');

interface EspnSearchHit {
  athlete?: { id?: string | number };
  id?: string | number;
}

export async function resolveSoccerAthlete(playerId: string, preferredLeague?: string): Promise<unknown | null> {
  const activeSlugs = getActiveSoccerLeagueSlugs();
  const slugs = preferredLeague
    ? [preferredLeague, ...activeSlugs.filter((s) => s !== preferredLeague)]
    : activeSlugs;

  for (const slug of slugs) {
    const data = await espnSoccerAthlete(playerId, slug);
    if (data) return data;
  }
  return null;
}

export async function searchSoccerAthletesAllLeagues(query: string): Promise<unknown[]> {
  const seen = new Set<string>();
  const merged: unknown[] = [];

  await Promise.all(
    getActiveSoccerLeagueSlugs().map(async (slug) => {
      const results = await espnSoccerSearchAthletes(query, slug);
      for (const item of results) {
        const hit = item as EspnSearchHit;
        const id = String(hit.athlete?.id ?? hit.id ?? '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        merged.push({ ...(item as Record<string, unknown>), leagueSlug: slug });
      }
    }),
  );

  return merged.slice(0, 12);
}

export async function fetchSoccerStandingsAllLeagues(): Promise<StandingsGroup[]> {
  const groups: StandingsGroup[] = [];

  await Promise.all(
    getActiveSoccerLeagueSlugs().map(async (slug) => {
      const standings = await safeTryAsync(
        log,
        'fetchSoccerStandings',
        slug,
        () => espnSoccerStandings(slug),
        [],
      );
      if (!standings.length) return;
      const label = leagueLabel(slug);
      for (const group of standings) {
        groups.push({
          ...group,
          name: standings.length > 1 || group.name !== 'Table'
            ? `${label} — ${group.name}`
            : label,
        });
      }
    }),
  );

  return groups;
}

export async function resolveSoccerTeamRoster(teamId: string): Promise<unknown | null> {
  for (const slug of getActiveSoccerLeagueSlugs()) {
    const data = await espnSoccerTeamRoster(teamId, slug);
    if (data) return data;
  }
  return null;
}

export async function resolveSoccerTeamSchedule(teamId: string): Promise<unknown | null> {
  for (const slug of getActiveSoccerLeagueSlugs()) {
    const data = await espnSoccerTeamSchedule(teamId, slug);
    if (data) return data;
  }
  return null;
}
