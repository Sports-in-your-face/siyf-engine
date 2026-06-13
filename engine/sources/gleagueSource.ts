import { fetchJsonResilient } from '../core/resilientFetch';
import { parseEspnRoster } from './espnSource';
import type { Player } from '../../types';

const GLEAGUE_BASE = '/api/espn/apis/site/v2/sports/basketball/nba-gleague';

let assignmentsCache: Map<string, string> | null = null;
let assignmentsInflight: Promise<Map<string, string>> | null = null;

export async function fetchGLeagueRoster(teamId: string): Promise<Player[]> {
  const raw = await fetchJsonResilient<any>(
    `${GLEAGUE_BASE}/teams/${teamId}/roster`,
    undefined,
    { label: `gleague-roster-${teamId}`, retries: 0, timeout: 6_000 },
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
  if (assignmentsCache) return assignmentsCache;
  if (assignmentsInflight) return assignmentsInflight;

  assignmentsInflight = (async () => {
    const map = new Map<string, string>();
    const raw = await fetchJsonResilient<any>(`${GLEAGUE_BASE}/teams`, undefined, {
      label: 'gleague-teams',
      retries: 1,
    });
    const teams = raw?.sports?.[0]?.leagues?.[0]?.teams ?? [];
    for (const entry of teams) {
      const team = entry?.team;
      if (!team?.id) continue;
      const roster = await fetchGLeagueRoster(String(team.id));
      for (const p of roster) {
        map.set(p.name.toLowerCase(), team.abbreviation ?? team.displayName ?? 'GL');
      }
    }
    assignmentsCache = map;
    return map;
  })();

  try {
    return await assignmentsInflight;
  } finally {
    assignmentsInflight = null;
  }
}

/** Tag NBA roster players on G-League assignments — never pass NBA team IDs to G-League roster API. */
export async function enrichRosterWithGLeague(_teamId: string, roster: Player[]): Promise<Player[]> {
  try {
    const assignments = await fetchGLeagueAssignments();
    if (!assignments.size) return roster;
    return roster.map((p) => {
      const glTeam = assignments.get(p.name.toLowerCase());
      if (!glTeam) return p;
      const tagged = p.position.includes('Two-Way') ? p.position : `${p.position} · Two-Way`;
      return { ...p, position: tagged };
    });
  } catch {
    return roster;
  }
}
