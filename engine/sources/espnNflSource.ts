import {
  cacheGet,
  cacheGetStale,
  cacheKey,
  cacheSetWithProfile,
  cachedFetch,
} from '../core/cache';
import { profileForResource } from '../core/cacheTiers';
import type { GameLiveState } from '../core/cacheTiers';
import { fetchJsonResilient } from '../core/resilientFetch';
import type {
  BoxScorePlayer,
  GameBoxScore,
  PlayEvent,
  StandingsGroup,
  StatItem,
  Team,
} from '../core/types';
import { enrichNflTeam, resolveNflTeamLogo } from './teamRegistry';
import { espnSearchAthletesWithFallback } from './espnCoreSearch';
import { extractStandingsChildren, fetchEspnStandingsPayload } from './espnStandingsUtils';
import { parseEspnRosterEntries } from './espnRosterUtils';

const BASE = '/api/espn/apis/site/v2/sports/football/nfl';
const COMMON = '/api/espn/apis/common/v3/sports/football/nfl';
const STANDINGS_ALT = '/api/espn/apis/v2/sports/football/nfl/standings';

export async function espnNflScoreboard(dates?: string): Promise<any | null> {
  const key = cacheKey('espn-nfl', 'scoreboard', dates ?? 'today');
  return cachedFetch(
    key,
    profileForResource('scoreboard'),
    ({ bypassCache }) => {
      const url = dates ? `${BASE}/scoreboard?dates=${dates}` : `${BASE}/scoreboard`;
      return fetchJsonResilient<any>(url, undefined, { label: 'espn-nfl-scoreboard', retries: 2, bypassCache });
    },
    ['scoreboard', 'nfl'],
  );
}

/** Full NFL week schedule via scoreboard (regular season default). */
export async function espnNflWeekScoreboard(
  week: number,
  year?: number,
  seasonType = 2,
): Promise<any | null> {
  const yr = year ?? new Date().getFullYear();
  const key = cacheKey('espn-nfl', 'scoreboard', `week-${week}`, String(yr), String(seasonType));
  return cachedFetch(
    key,
    profileForResource('schedule'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(
        `${BASE}/scoreboard?seasontype=${seasonType}&week=${week}&year=${yr}`,
        undefined,
        { label: `espn-nfl-scoreboard-week-${week}`, retries: 2, bypassCache },
      ),
    ['schedule', 'nfl', `week:${week}`],
  );
}

export async function espnNflTeams(): Promise<any | null> {
  const key = cacheKey('espn-nfl', 'teams');
  return cachedFetch(
    key,
    profileForResource('teams'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${BASE}/teams`, undefined, { label: 'espn-nfl-teams', retries: 2, bypassCache }),
    ['teams', 'nfl'],
  );
}

export async function espnNflSummary(eventId: string, gameState?: GameLiveState): Promise<any | null> {
  const key = cacheKey('espn-nfl', 'summary', eventId);
  return cachedFetch(
    key,
    profileForResource('summary', gameState),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${BASE}/summary?event=${eventId}`, undefined, {
        label: `espn-nfl-summary-${eventId}`,
        retries: 2,
        timeout: 10_000,
        bypassCache,
      }),
    [`game:${eventId}`],
  );
}

export async function espnNflTeamSchedule(teamId: string): Promise<any | null> {
  const key = cacheKey('espn-nfl', 'schedule', teamId);
  return cachedFetch(
    key,
    profileForResource('schedule'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${BASE}/teams/${teamId}/schedule`, undefined, {
        label: `espn-nfl-schedule-${teamId}`,
        bypassCache,
      }),
    [`team:${teamId}`, 'schedule'],
  );
}

export async function espnNflTeamRoster(teamId: string): Promise<any | null> {
  const key = cacheKey('espn-nfl', 'roster', teamId);
  return cachedFetch(
    key,
    profileForResource('roster'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${BASE}/teams/${teamId}/roster`, undefined, {
        label: `espn-nfl-roster-${teamId}`,
        bypassCache,
      }),
    [`team:${teamId}`, 'roster'],
  );
}

export async function espnNflStandings(): Promise<StandingsGroup[]> {
  const key = cacheKey('espn-nfl', 'standings');
  const cached = cacheGet<StandingsGroup[]>(key);
  if (cached?.length) return cached;

  const data = await fetchEspnStandingsPayload(
    `${BASE}/standings`,
    STANDINGS_ALT,
    'espn-nfl-standings',
  );
  if (!data) return cacheGetStale<StandingsGroup[]>(key) ?? [];

  const children = extractStandingsChildren(data);

  const groups: StandingsGroup[] = children.map((conf: any) => ({
    name: conf.name ?? conf.abbreviation ?? 'Conference',
    rows: (conf.standings?.entries ?? conf.entries ?? []).map((entry: any, idx: number) => {
      const team = entry.team ?? {};
      const stats = entry.stats ?? [];
      const statVal = (name: string) =>
        stats.find((s: any) => s.name === name || s.type === name || s.abbreviation === name)?.displayValue ?? '0';

      const abbr = team.abbreviation ?? '—';
      const resolved = enrichNflTeam(abbr, {
        id: String(team.id),
        espnId: String(team.id),
        name: team.displayName ?? team.name,
        logo: team.logos?.[0]?.href,
        color: team.color ? `#${team.color}` : undefined,
        alternateColor: team.alternateColor ? `#${team.alternateColor}` : undefined,
      });

      return {
        rank: idx + 1,
        team: resolved,
        wins: parseInt(statVal('wins'), 10) || 0,
        losses: parseInt(statVal('losses'), 10) || 0,
        winPct: statVal('winPercent') || statVal('winPct') || '.000',
        streak: statVal('streak') || undefined,
        gamesBack: statVal('gamesBehind') || statVal('gamesBack') || undefined,
      };
    }),
  }));

  cacheSetWithProfile(key, groups, profileForResource('standings'), ['standings', 'nfl']);
  return groups;
}

export async function espnNflAthlete(id: string): Promise<any | null> {
  const key = cacheKey('espn-nfl', 'athlete', id);
  return cachedFetch(
    key,
    profileForResource('athlete'),
    async ({ bypassCache }) => {
      const opts = { bypassCache };
      const fetchStats = () =>
        fetchJsonResilient<any>(`${COMMON}/athletes/${id}/stats`, undefined, {
          label: 'espn-nfl-athlete-stats',
          ...opts,
        }).catch(() => null);

      const [bio, overview, stats] = await Promise.all([
        fetchJsonResilient<any>(`${COMMON}/athletes/${id}`, undefined, { label: 'espn-nfl-athlete-bio', ...opts }),
        fetchJsonResilient<any>(`${COMMON}/athletes/${id}/overview`, undefined, { label: 'espn-nfl-athlete-overview', ...opts }),
        fetchStats(),
      ]);

      if (!bio && !overview) {
        const siteV2 = await fetchJsonResilient<any>(
          `${BASE}/athletes/${id}`,
          undefined,
          { label: 'espn-nfl-athlete-site-v2', ...opts },
        );
        if (siteV2) return { bio: siteV2, overview: siteV2, stats: stats ?? null };
      }

      if (!bio && !overview && !stats) return null;
      return { bio, overview, stats };
    },
    [`player:${id}`],
  );
}

export async function espnNflSearchAthletes(query: string): Promise<any[]> {
  const key = cacheKey('espn-nfl', 'search', query.toLowerCase());
  const encoded = encodeURIComponent(query.trim());
  const result = await cachedFetch<any[]>(
    key,
    profileForResource('search'),
    async ({ bypassCache }) =>
      espnSearchAthletesWithFallback(
        query,
        { sport: 'football', league: 'nfl', label: 'nfl' },
        `${COMMON}/athletes?search=${encoded}&limit=10`,
      ),
    ['search'],
  );
  return result ?? [];
}

const STAT_LABEL_MAP: Record<string, string> = {
  totalYards: 'Total Yds',
  netPassingYards: 'Pass Yds',
  rushingYards: 'Rush Yds',
  yardsPerPlay: 'Yds/Play',
  thirdDownEff: '3rd Down',
  redZoneAttempts: 'Red Zone',
  turnovers: 'Turnovers',
  possessionTime: 'Time of Poss',
};

function humanizeStatLabel(raw: string): string {
  if (STAT_LABEL_MAP[raw]) return STAT_LABEL_MAP[raw];
  if (/^[A-Z0-9%]+$/.test(raw)) return raw;
  const spaced = raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/Pct$/i, ' %')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function mapStatRow(labels: string[], values: (string | number)[]): StatItem[] {
  return labels.map((label, i) => ({ label: humanizeStatLabel(label), value: values[i] ?? '—' }));
}

function parsePlayerBlock(block: any): BoxScorePlayer[] {
  const labels: string[] = block?.statistics?.[0]?.labels ?? [];
  const athletes: any[] = block?.statistics?.[0]?.athletes ?? [];
  if (!labels.length || !athletes.length) return [];

  return athletes.map((entry: any) => {
    const athlete = entry.athlete ?? {};
    const stats = entry.stats ?? [];
    return {
      id: String(athlete.id ?? athlete.displayName),
      name: athlete.displayName ?? athlete.shortName ?? 'Unknown',
      position: athlete.position?.abbreviation ?? '—',
      number: athlete.jersey,
      headshot: athlete.headshot?.href ?? athlete.headshot,
      starter: Boolean(entry.starter),
      stats: mapStatRow(labels, stats),
    };
  });
}

export function parseEspnNflBoxScore(summary: any, awayTeam: Team, homeTeam: Team): GameBoxScore | undefined {
  const playerBlocks = summary?.boxscore?.players ?? [];
  if (!playerBlocks.length) return undefined;

  const buildSide = (side: 'away' | 'home', team: Team) => {
    const homeAway = side === 'home' ? 'home' : 'away';
    const block = playerBlocks.find((p: any) => p.homeAway === homeAway) ?? playerBlocks[side === 'away' ? 0 : 1];
    const teamBlock = summary?.boxscore?.teams?.find((t: any) => t.homeAway === homeAway);
    const totalsLabels: string[] = teamBlock?.statistics?.[0]?.labels ?? [];
    const totalsValues: string[] = teamBlock?.statistics?.[0]?.stats ?? [];

    return {
      team: { ...team, logo: resolveNflTeamLogo(team.abbr, team.logo) },
      players: parsePlayerBlock(block),
      totals: totalsLabels.length ? mapStatRow(totalsLabels, totalsValues) : [],
    };
  };

  return { away: buildSide('away', awayTeam), home: buildSide('home', homeTeam) };
}

export function parseEspnNflTeamStats(summary: any): { away: StatItem[]; home: StatItem[] } | undefined {
  const boxTeams = summary?.boxscore?.teams ?? [];
  const headerComp = summary?.header?.competitions?.[0];

  const fromBox = (homeAway: string): StatItem[] => {
    const team = boxTeams.find((t: any) => t.homeAway === homeAway);
    const stats = team?.statistics?.[0]?.stats ?? [];
    const labels = team?.statistics?.[0]?.labels ?? [];
    if (stats.length && labels.length) return mapStatRow(labels, stats).slice(0, 12);
    return (team?.statistics ?? [])
      .filter((s: any) => s.displayValue !== undefined)
      .map((s: any) => ({ label: humanizeStatLabel(s.name ?? s.abbreviation ?? s.displayName ?? ''), value: s.displayValue }));
  };

  let away = fromBox('away');
  let home = fromBox('home');

  if ((!away.length || !home.length) && headerComp?.competitors) {
    const compStats = (homeAway: string) =>
      (headerComp.competitors.find((c: any) => c.homeAway === homeAway)?.statistics ?? [])
        .filter((s: any) => s.displayValue !== undefined)
        .map((s: any) => ({ label: humanizeStatLabel(s.name ?? s.abbreviation ?? ''), value: s.displayValue }))
        .slice(0, 12);

    if (!away.length) away = compStats('away');
    if (!home.length) home = compStats('home');
  }

  if (!away.length && !home.length) return undefined;
  return { away, home };
}

export function parseEspnNflPlays(summary: any): PlayEvent[] {
  const drives = [
    ...(summary?.drives?.previous ?? []),
    ...(summary?.drives?.current ? [summary.drives.current] : []),
  ];
  const allFromDrives = drives.flatMap((d: any) => d.plays ?? []);
  const scoringPlays = summary?.scoringPlays ?? [];
  const rawPlays = allFromDrives.length
    ? allFromDrives
    : (scoringPlays.length ? scoringPlays : summary?.plays ?? []);

  if (!Array.isArray(rawPlays) || !rawPlays.length) return [];

  return [...rawPlays].reverse().slice(0, 150).map((p: any, idx: number) => ({
    id: String(p.id ?? idx),
    period: p.period?.displayValue ?? (p.period?.number ? `Q${p.period.number}` : ''),
    clock: p.clock?.displayValue ?? '',
    text: p.text ?? p.shortText ?? p.type?.text ?? '',
    teamAbbr: p.team?.abbreviation,
    scoringPlay: Boolean(p.scoringPlay),
  }));
}

export function parseEspnNflGameMeta(summary: any) {
  const comp = summary?.header?.competitions?.[0] ?? summary?.gameInfo;
  return {
    venue: comp?.venue?.fullName ?? summary?.gameInfo?.venue?.fullName,
    broadcast: comp?.broadcasts?.find((b: any) => b.market === 'national')?.names?.join(', ')
      ?? comp?.broadcasts?.[0]?.names?.join(', ')
      ?? comp?.broadcast,
    attendance: comp?.attendance ? String(comp.attendance) : undefined,
  };
}

function statValue(labels: string[], stats: (string | number)[], ...candidates: string[]): number {
  for (const label of candidates) {
    const idx = labels.indexOf(label);
    if (idx >= 0) {
      const n = parseInt(String(stats[idx] ?? 0), 10);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

export function parseEspnNflTopPerformers(summary: any) {
  const playerBlocks = summary?.boxscore?.players ?? [];
  if (!playerBlocks.length) return [];

  const performers: { id: string; name: string; team: string; position: string; headshot?: string; stats: StatItem[]; score: number }[] = [];

  for (const block of playerBlocks) {
    const labels: string[] = block?.statistics?.[0]?.labels ?? [];
    const teamAbbr = block?.team?.abbreviation ?? '—';

    for (const entry of block?.statistics?.[0]?.athletes ?? []) {
      const athlete = entry.athlete ?? {};
      const stats = entry.stats ?? [];
      if (!athlete.displayName) continue;

      const passYds = statValue(labels, stats, 'PASS YDS', 'PYDS');
      const rushYds = statValue(labels, stats, 'RUSH YDS', 'RYDS');
      const recYds = statValue(labels, stats, 'REC YDS');
      const tds = statValue(labels, stats, 'TD', 'TDs');
      const primaryYds = passYds || rushYds || recYds;
      const score = primaryYds + tds * 100;

      const statItems: StatItem[] = [];
      const addStat = (label: string, ...keys: string[]) => {
        const idx = keys.map((k) => labels.indexOf(k)).find((i) => i >= 0);
        if (idx !== undefined && idx >= 0) statItems.push({ label, value: stats[idx] ?? '—' });
      };
      addStat('PASS YDS', 'PASS YDS', 'PYDS');
      addStat('RUSH YDS', 'RUSH YDS', 'RYDS');
      addStat('REC YDS', 'REC YDS');
      addStat('TD', 'TD');

      performers.push({
        id: String(athlete.id),
        name: athlete.displayName,
        team: teamAbbr,
        position: athlete.position?.abbreviation ?? '—',
        headshot: athlete.headshot?.href,
        stats: statItems.length ? statItems : mapStatRow(labels, stats).slice(0, 4),
        score,
      });
    }
  }

  return performers.sort((a, b) => b.score - a.score).slice(0, 8);
}

export function parseEspnNflTeamsList(data: any) {
  const teamsList = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  return teamsList.map((t: any) => {
    const team = t.team ?? {};
    const abbr = team.abbreviation ?? '—';
    return enrichNflTeam(abbr, {
      id: String(team.id),
      espnId: String(team.id),
      name: team.displayName ?? team.name,
      logo: team.logos?.[0]?.href,
      color: team.color ? `#${team.color}` : undefined,
      alternateColor: team.alternateColor ? `#${team.alternateColor}` : undefined,
    });
  });
}

export function parseEspnNflRoster(data: any) {
  return parseEspnRosterEntries(data);
}

const NFL_STAT_ICONS: Record<string, string> = {
  passingYards: 'ph-football',
  rushingYards: 'ph-arrow-right',
  receivingYards: 'ph-hand-grabbing',
  passingTouchdowns: 'ph-star',
  totalTouchdowns: 'ph-star',
};

export interface NflStatLeaderEntry {
  name: string;
  team: string;
  logo: string;
  value: string;
}

export interface NflStatCategory {
  label: string;
  icon: string;
  leaders: NflStatLeaderEntry[];
}

export interface NflDraftPick {
  pick: number;
  round: number;
  player: string;
  team: string;
  teamId: string;
  pos: string;
  college: string;
}

export interface NflDraftBoard {
  meta: {
    year?: number;
    displayName: string;
    pickCount: number;
    roundCount: number;
  };
  picks: NflDraftPick[];
}

export async function espnNflLeaders(): Promise<any | null> {
  const key = cacheKey('espn-nfl', 'leaders');
  return cachedFetch(
    key,
    profileForResource('standings'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>('/api/espn/apis/site/v3/sports/football/nfl/leaders?limit=5', undefined, {
        label: 'espn-nfl-leaders',
        retries: 2,
        bypassCache,
      }),
    ['standings', 'nfl', 'leaders'],
  );
}

export async function espnNflDraft(): Promise<any | null> {
  const key = cacheKey('espn-nfl', 'draft');
  return cachedFetch(
    key,
    profileForResource('standings'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${BASE}/draft`, undefined, {
        label: 'espn-nfl-draft',
        retries: 2,
        bypassCache,
      }),
    ['draft', 'nfl'],
  );
}

export function parseEspnNflStatLeaders(data: any): NflStatCategory[] | null {
  const categories = data?.leaders?.categories ?? [];
  if (!categories.length) return null;

  const wanted = ['passingYards', 'rushingYards', 'receivingYards', 'passingTouchdowns'];
  const nflLogo = (abbr: string) => `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`;
  const mapped: NflStatCategory[] = [];

  for (const key of wanted) {
    const cat = categories.find((c: any) => c.name === key)
      ?? (key === 'passingTouchdowns' ? categories.find((c: any) => c.name === 'totalTouchdowns') : null);
    if (!cat?.leaders?.length) continue;

    mapped.push({
      label: cat.displayName ?? cat.name,
      icon: NFL_STAT_ICONS[key] ?? NFL_STAT_ICONS[cat.name] ?? 'ph-chart-bar',
      leaders: cat.leaders.slice(0, 5).map((l: any) => {
        const abbr = l.team?.abbreviation ?? '—';
        return {
          name: l.athlete?.displayName ?? '—',
          team: abbr,
          logo: l.team?.logos?.[0]?.href ?? nflLogo(abbr),
          value: String(l.displayValue ?? l.value ?? '—'),
        };
      }),
    });
  }

  return mapped.length ? mapped : null;
}

export function parseEspnNflDraft(data: any): NflDraftBoard | null {
  if (!data?.picks?.length) return null;

  const teamMap = Object.fromEntries((data.teams ?? []).map((t: any) => [String(t.id), t]));
  const posMap = Object.fromEntries(
    (data.positions ?? []).map((p: any) => [String(p.id), p.abbreviation ?? p.displayName ?? '—']),
  );

  const picks: NflDraftPick[] = data.picks.map((p: any) => {
    const team = teamMap[String(p.teamId)];
    const abbr = (team?.abbreviation ?? '—').toLowerCase();
    const posId = p.athlete?.position?.id;
    return {
      pick: p.overall ?? p.pick ?? 0,
      round: p.round ?? 1,
      player: p.athlete?.displayName ?? 'TBD',
      team: team?.displayName ?? team?.name ?? '—',
      teamId: abbr,
      pos: posMap[String(posId)] ?? '—',
      college: p.athlete?.team?.displayName ?? p.athlete?.team?.name ?? '—',
    };
  });

  return {
    meta: {
      year: data.year,
      displayName: data.displayName ?? `${data.year ?? ''} NFL Draft`.trim(),
      pickCount: picks.length,
      roundCount: data.rounds?.length ?? 7,
    },
    picks,
  };
}
