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
import { enrichMlbTeam, resolveMlbTeamLogo } from './teamRegistry';
import { espnSearchAthletesWithFallback } from './espnCoreSearch';
import { extractStandingsChildren, fetchEspnStandingsPayload } from './espnStandingsUtils';
import { parseEspnRosterEntries } from './espnRosterUtils';
import { parseEspnStatLeaders } from './espnStatLeaders';

const BASE = '/api/espn/apis/site/v2/sports/baseball/mlb';
const COMMON = '/api/espn/apis/common/v3/sports/baseball/mlb';
const STANDINGS_ALT = '/api/espn/apis/v2/sports/baseball/mlb/standings';

export async function espnMlbScoreboard(dates?: string): Promise<any | null> {
  const key = cacheKey('espn-mlb', 'scoreboard', dates ?? 'today');
  return cachedFetch(
    key,
    profileForResource('scoreboard'),
    ({ bypassCache }) => {
      const url = dates ? `${BASE}/scoreboard?dates=${dates}` : `${BASE}/scoreboard`;
      return fetchJsonResilient<any>(url, undefined, { label: 'espn-mlb-scoreboard', retries: 2, bypassCache });
    },
    ['scoreboard', 'mlb'],
  );
}

export async function espnMlbTeams(): Promise<any | null> {
  const key = cacheKey('espn-mlb', 'teams');
  return cachedFetch(
    key,
    profileForResource('teams'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${BASE}/teams`, undefined, { label: 'espn-mlb-teams', retries: 2, bypassCache }),
    ['teams', 'mlb'],
  );
}

export async function espnMlbSummary(eventId: string, gameState?: GameLiveState): Promise<any | null> {
  const key = cacheKey('espn-mlb', 'summary', eventId);
  return cachedFetch(
    key,
    profileForResource('summary', gameState),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${BASE}/summary?event=${eventId}`, undefined, {
        label: `espn-mlb-summary-${eventId}`,
        retries: 2,
        timeout: 10_000,
        bypassCache,
      }),
    [`game:${eventId}`],
  );
}

export async function espnMlbTeamSchedule(teamId: string): Promise<any | null> {
  const key = cacheKey('espn-mlb', 'schedule', teamId);
  return cachedFetch(
    key,
    profileForResource('schedule'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${BASE}/teams/${teamId}/schedule`, undefined, {
        label: `espn-mlb-schedule-${teamId}`,
        bypassCache,
      }),
    [`team:${teamId}`, 'schedule'],
  );
}

export async function espnMlbTeamRoster(teamId: string): Promise<any | null> {
  const key = cacheKey('espn-mlb', 'roster', teamId);
  return cachedFetch(
    key,
    profileForResource('roster'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${BASE}/teams/${teamId}/roster`, undefined, {
        label: `espn-mlb-roster-${teamId}`,
        bypassCache,
      }),
    [`team:${teamId}`, 'roster'],
  );
}

export async function espnMlbStandings(): Promise<StandingsGroup[]> {
  const key = cacheKey('espn-mlb', 'standings');
  const cached = cacheGet<StandingsGroup[]>(key);
  if (cached?.length) return cached;

  const data = await fetchEspnStandingsPayload(
    `${BASE}/standings`,
    STANDINGS_ALT,
    'espn-mlb-standings',
  );
  if (!data) return cacheGetStale<StandingsGroup[]>(key) ?? [];

  const children = extractStandingsChildren(data);

  const groups: StandingsGroup[] = children.map((conf: any) => ({
    name: conf.name ?? conf.abbreviation ?? 'Division',
    rows: (conf.standings?.entries ?? conf.entries ?? []).map((entry: any, idx: number) => {
      const team = entry.team ?? {};
      const stats = entry.stats ?? [];
      const statVal = (name: string) =>
        stats.find((s: any) => s.name === name || s.type === name || s.abbreviation === name)?.displayValue ?? '0';

      const abbr = team.abbreviation ?? '—';
      const resolved = enrichMlbTeam(abbr, {
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

  cacheSetWithProfile(key, groups, profileForResource('standings'), ['standings', 'mlb']);
  return groups;
}

export async function espnMlbAthlete(id: string): Promise<any | null> {
  if (!id || !/^\d+$/.test(String(id))) return null;

  const key = cacheKey('espn-mlb', 'athlete', id);
  return cachedFetch(
    key,
    profileForResource('athlete'),
    async ({ bypassCache }) => {
      const opts = { bypassCache };
      const [bio, overview, stats] = await Promise.all([
        fetchJsonResilient<any>(`${COMMON}/athletes/${id}`, undefined, { label: 'espn-mlb-athlete-bio', ...opts }),
        fetchJsonResilient<any>(`${COMMON}/athletes/${id}/overview`, undefined, { label: 'espn-mlb-athlete-overview', ...opts }),
        fetchJsonResilient<any>(`${COMMON}/athletes/${id}/stats`, undefined, { label: 'espn-mlb-athlete-stats', ...opts }),
      ]);
      if (!bio && !overview && !stats) return null;
      return { bio, overview, stats };
    },
    [`player:${id}`],
  );
}

export async function espnMlbSearchAthletes(query: string): Promise<any[]> {
  const key = cacheKey('espn-mlb', 'search', query.toLowerCase());
  const encoded = encodeURIComponent(query.trim());
  const result = await cachedFetch<any[]>(
    key,
    profileForResource('search'),
    async () =>
      espnSearchAthletesWithFallback(
        query,
        { sport: 'baseball', league: 'mlb', label: 'mlb' },
        `${COMMON}/athletes?search=${encoded}&limit=10`,
      ),
    ['search'],
  );
  return result ?? [];
}

const STAT_LABEL_MAP: Record<string, string> = {
  hits: 'H',
  runs: 'R',
  homeRuns: 'HR',
  runsBattedIn: 'RBI',
  battingAverage: 'AVG',
  onBasePct: 'OBP',
  slugPct: 'SLG',
  inningsPitched: 'IP',
  earnedRuns: 'ER',
  strikeouts: 'SO',
  walks: 'BB',
  era: 'ERA',
  whip: 'WHIP',
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

export function parseEspnMlbBoxScore(summary: any, awayTeam: Team, homeTeam: Team): GameBoxScore | undefined {
  const playerBlocks = summary?.boxscore?.players ?? [];
  if (!playerBlocks.length) return undefined;

  const buildSide = (side: 'away' | 'home', team: Team) => {
    const homeAway = side === 'home' ? 'home' : 'away';
    const block = playerBlocks.find((p: any) => p.homeAway === homeAway) ?? playerBlocks[side === 'away' ? 0 : 1];
    const teamBlock = summary?.boxscore?.teams?.find((t: any) => t.homeAway === homeAway);
    const totalsLabels: string[] = teamBlock?.statistics?.[0]?.labels ?? [];
    const totalsValues: string[] = teamBlock?.statistics?.[0]?.stats ?? [];

    return {
      team: { ...team, logo: resolveMlbTeamLogo(team.abbr, team.logo) },
      players: parsePlayerBlock(block),
      totals: totalsLabels.length ? mapStatRow(totalsLabels, totalsValues) : [],
    };
  };

  return { away: buildSide('away', awayTeam), home: buildSide('home', homeTeam) };
}

export function parseEspnMlbTeamStats(summary: any): { away: StatItem[]; home: StatItem[] } | undefined {
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

export function parseEspnMlbPlays(summary: any): PlayEvent[] {
  const scoringPlays = summary?.scoringPlays ?? [];
  const rawPlays = scoringPlays.length ? scoringPlays : summary?.plays ?? [];

  if (!Array.isArray(rawPlays) || !rawPlays.length) return [];

  return [...rawPlays].reverse().slice(0, 150).map((p: any, idx: number) => ({
    id: String(p.id ?? idx),
    period: p.period?.displayValue ?? (p.period?.number ? `Inning ${p.period.number}` : ''),
    clock: p.clock?.displayValue ?? '',
    text: p.text ?? p.shortText ?? p.type?.text ?? '',
    teamAbbr: p.team?.abbreviation,
    scoringPlay: Boolean(p.scoringPlay),
  }));
}

export function parseEspnMlbGameMeta(summary: any) {
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

export function parseEspnMlbTopPerformers(summary: any) {
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

      const hr = statValue(labels, stats, 'HR');
      const rbi = statValue(labels, stats, 'RBI');
      const hits = statValue(labels, stats, 'H');
      const runs = statValue(labels, stats, 'R');
      const so = statValue(labels, stats, 'SO', 'K');
      const score = hr * 100 + rbi * 25 + hits * 10 + runs * 5 + so * 15;

      const statItems: StatItem[] = [];
      const addStat = (label: string, ...keys: string[]) => {
        const idx = keys.map((k) => labels.indexOf(k)).find((i) => i >= 0);
        if (idx !== undefined && idx >= 0) statItems.push({ label, value: stats[idx] ?? '—' });
      };
      addStat('H', 'H');
      addStat('R', 'R');
      addStat('HR', 'HR');
      addStat('RBI', 'RBI');
      addStat('SO', 'SO', 'K');
      addStat('IP', 'IP');

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

export function parseEspnMlbTeamsList(data: any) {
  const teamsList = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  return teamsList.map((t: any) => {
    const team = t.team ?? {};
    const abbr = team.abbreviation ?? '—';
    return enrichMlbTeam(abbr, {
      id: String(team.id),
      espnId: String(team.id),
      name: team.displayName ?? team.name,
      logo: team.logos?.[0]?.href,
      color: team.color ? `#${team.color}` : undefined,
      alternateColor: team.alternateColor ? `#${team.alternateColor}` : undefined,
    });
  });
}

export function parseEspnMlbRoster(data: any) {
  return parseEspnRosterEntries(data);
}

const MLB_STAT_ICONS: Record<string, string> = {
  homeRuns: 'ph-lightning',
  avg: 'ph-target',
  ERA: 'ph-shield',
  RBIs: 'ph-users-three',
  wins: 'ph-trophy',
  strikeouts: 'ph-fire',
};

export async function espnMlbLeaders(): Promise<unknown | null> {
  const key = cacheKey('espn-mlb', 'leaders');
  return cachedFetch(
    key,
    profileForResource('standings'),
    ({ bypassCache }) =>
      fetchJsonResilient<unknown>('/api/espn/apis/site/v3/sports/baseball/mlb/leaders?limit=5', undefined, {
        label: 'espn-mlb-leaders',
        retries: 2,
        bypassCache,
      }),
    ['standings', 'mlb', 'leaders'],
  );
}

export function parseEspnMlbStatLeaders(data: unknown) {
  const mlbLogo = (abbr: string) => `https://a.espncdn.com/i/teamlogos/mlb/500/${abbr.toLowerCase()}.png`;
  return parseEspnStatLeaders(data, {
    categories: [
      { key: 'homeRuns', icon: MLB_STAT_ICONS.homeRuns },
      { key: 'avg', icon: MLB_STAT_ICONS.avg, label: 'Batting Avg' },
      { key: 'ERA', icon: MLB_STAT_ICONS.ERA },
      { key: 'RBIs', icon: MLB_STAT_ICONS.RBIs },
      { key: 'wins', icon: MLB_STAT_ICONS.wins },
      { key: 'strikeouts', icon: MLB_STAT_ICONS.strikeouts },
    ],
    teamLogo: mlbLogo,
    formatValue: formatMlbLeaderValue,
  });
}

function formatMlbLeaderValue(
  leader: { displayValue?: string; value?: string | number },
  categoryKey: string,
): string {
  const raw = leader.value;
  if (raw == null || raw === '') return leader.displayValue ?? '—';

  const num = Number(raw);
  if (Number.isNaN(num)) return String(raw);

  switch (categoryKey) {
    case 'avg':
      return num.toFixed(3).replace(/^0/, '');
    case 'ERA':
      return num.toFixed(2);
    default:
      return String(Math.round(num));
  }
}
