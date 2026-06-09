import { fetchJsonResilient } from '../core/resilientFetch';
import { parseEspnRoster } from './espnSource';
import type { Player } from '../../types';

const GLEAGUE_BASE = '/api/espn/apis/site/v2/sports/basketball/nba-gleague';

export async function fetchGLeagueRoster(teamId: string): Promise<Player[]> {
  const raw = await fetchJsonResilient<any>(
    `${GLEAGUE_BASE}/teams/${teamId}/roster`,
    undefined,
    { label: `gleague-roster-${teamId}`, retries: 1, timeout: 6_000 },
  );
  if (!raw) return [];
  return parseEspnRoster(raw).map((p: { id: string; name: string; position: string; number?: string; headshot?: string }) => ({
    ...p,
    team: '',
    stats: [],
  }));
}

/** Cross-reference G-League assignments for two-way player accuracy */
export async function fetchGLeagueAssignments(): Promise<Map<string, string>> {
  const raw = await fetchJsonResilient<any>(`${GLEAGUE_BASE}/teams`, undefined, {
    label: 'gleague-teams',
    retries: 1,
  });
  const map = new Map<string, string>();
  const teams = raw?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  for (const entry of teams) {
    const team = entry?.team;
    if (!team?.id) continue;
    const roster = await fetchGLeagueRoster(String(team.id));
    for (const p of roster) {
      map.set(p.name.toLowerCase(), team.abbreviation ?? team.displayName ?? 'GL');
    }
  }
  return map;
}

export async function enrichRosterWithGLeague(teamId: string, roster: Player[]): Promise<Player[]> {
  try {
    const glRoster = await fetchGLeagueRoster(teamId);
    if (!glRoster.length) return roster;
    const glNames = new Set(glRoster.map((p) => p.name.toLowerCase()));
    return roster.map((p) =>
      glNames.has(p.name.toLowerCase())
        ? { ...p, position: p.position.includes('Two-Way') ? p.position : `${p.position} · Two-Way` }
        : p,
    );
  } catch {
    return roster;
  }
}
