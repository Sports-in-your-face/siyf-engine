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
import { extractEspnLeagueSlug, type EspnCompetitionRef, type EspnScoreboardEvent } from '../core/espnEventTypes';
import { enrichSoccerTeam, resolveSoccerTeamLogo } from './teamRegistry';

export const DEFAULT_SOCCER_LEAGUE = (() => {
  const fromProcess = typeof process !== 'undefined' ? process.env.SIYF_SOCCER_LEAGUE : undefined;
  const fromVite = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SIYF_SOCCER_LEAGUE : undefined;
  return fromProcess ?? fromVite ?? 'eng.1';
})();

function basePath(league: string) {
  return `/api/espn/apis/site/v2/sports/soccer/${league}`;
}

function commonPath(league: string) {
  return `/api/espn/apis/common/v3/sports/soccer/${league}`;
}

export async function espnSoccerScoreboard(league = DEFAULT_SOCCER_LEAGUE, dates?: string): Promise<any | null> {
  const key = cacheKey('espn-soccer', league, 'scoreboard', dates ?? 'today');
  return cachedFetch(
    key,
    profileForResource('scoreboard'),
    ({ bypassCache }) => {
      const url = dates ? `${basePath(league)}/scoreboard?dates=${dates}` : `${basePath(league)}/scoreboard`;
      return fetchJsonResilient<any>(url, undefined, { label: `espn-soccer-${league}-scoreboard`, retries: 2, bypassCache });
    },
    ['scoreboard', `soccer:${league}`],
  );
}

export async function espnSoccerTeams(league = DEFAULT_SOCCER_LEAGUE): Promise<any | null> {
  const key = cacheKey('espn-soccer', league, 'teams');
  return cachedFetch(
    key,
    profileForResource('teams'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${basePath(league)}/teams`, undefined, { label: `espn-soccer-${league}-teams`, retries: 2, bypassCache }),
    ['teams', `soccer:${league}`],
  );
}

export async function espnSoccerSummary(
  eventId: string,
  league = DEFAULT_SOCCER_LEAGUE,
  gameState?: GameLiveState,
): Promise<any | null> {
  const key = cacheKey('espn-soccer', league, 'summary', eventId);
  return cachedFetch(
    key,
    profileForResource('summary', gameState),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${basePath(league)}/summary?event=${eventId}`, undefined, {
        label: `espn-soccer-summary-${eventId}`,
        retries: 2,
        timeout: 10_000,
        bypassCache,
      }),
    [`game:${eventId}`],
  );
}

export async function espnSoccerTeamSchedule(teamId: string, league = DEFAULT_SOCCER_LEAGUE): Promise<any | null> {
  const key = cacheKey('espn-soccer', league, 'schedule', teamId);
  return cachedFetch(
    key,
    profileForResource('schedule'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${basePath(league)}/teams/${teamId}/schedule`, undefined, {
        label: `espn-soccer-schedule-${teamId}`,
        bypassCache,
      }),
    [`team:${teamId}`, 'schedule'],
  );
}

export async function espnSoccerTeamRoster(teamId: string, league = DEFAULT_SOCCER_LEAGUE): Promise<any | null> {
  const key = cacheKey('espn-soccer', league, 'roster', teamId);
  return cachedFetch(
    key,
    profileForResource('roster'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${basePath(league)}/teams/${teamId}/roster`, undefined, {
        label: `espn-soccer-roster-${teamId}`,
        bypassCache,
      }),
    [`team:${teamId}`, 'roster'],
  );
}

export async function espnSoccerStandings(league = DEFAULT_SOCCER_LEAGUE): Promise<StandingsGroup[]> {
  const key = cacheKey('espn-soccer', league, 'standings');
  const cached = cacheGet<StandingsGroup[]>(key);
  if (cached?.length) return cached;

  const data = await fetchJsonResilient<any>(`${basePath(league)}/standings`, undefined, { label: `espn-soccer-${league}-standings` });
  if (!data) return cacheGetStale<StandingsGroup[]>(key) ?? [];

  const children = data.children ?? data.standings?.entries ?? data.standings?.children ?? [];
  if (!children.length && data.standings?.entries) {
    const entries = data.standings.entries;
    const groups: StandingsGroup[] = [{
      name: 'Table',
      rows: entries.map((entry: any, idx: number) => parseStandingsRow(entry, idx)),
    }];
    cacheSetWithProfile(key, groups, profileForResource('standings'), ['standings', `soccer:${league}`]);
    return groups;
  }

  if (!children.length) return cacheGetStale<StandingsGroup[]>(key) ?? [];

  const groups: StandingsGroup[] = children.map((conf: any) => ({
    name: conf.name ?? conf.abbreviation ?? 'Table',
    rows: (conf.standings?.entries ?? conf.entries ?? []).map((entry: any, idx: number) => parseStandingsRow(entry, idx)),
  }));

  cacheSetWithProfile(key, groups, profileForResource('standings'), ['standings', `soccer:${league}`]);
  return groups;
}

function parseStandingsRow(entry: any, idx: number) {
  const team = entry.team ?? {};
  const stats = entry.stats ?? [];
  const statVal = (name: string) =>
    stats.find((s: any) => s.name === name || s.type === name || s.abbreviation === name)?.displayValue ?? '0';

  const abbr = team.abbreviation ?? team.shortDisplayName?.slice(0, 3)?.toUpperCase() ?? '—';
  const resolved = enrichSoccerTeam(abbr, {
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
    wins: parseInt(statVal('wins'), 10) || parseInt(statVal('W'), 10) || 0,
    losses: parseInt(statVal('losses'), 10) || parseInt(statVal('L'), 10) || 0,
    winPct: statVal('winPercent') || statVal('points') || statVal('Pts') || '.000',
    streak: statVal('streak') || undefined,
    gamesBack: statVal('gamesBehind') || statVal('gamesBack') || undefined,
  };
}

export async function espnSoccerAthlete(id: string, league = DEFAULT_SOCCER_LEAGUE): Promise<any | null> {
  const key = cacheKey('espn-soccer', league, 'athlete', id);
  return cachedFetch(
    key,
    profileForResource('athlete'),
    async ({ bypassCache }) => {
      const opts = { bypassCache };
      const fetchStats = () =>
        fetchJsonResilient<any>(`${commonPath(league)}/athletes/${id}/stats`, undefined, {
          label: 'espn-soccer-athlete-stats',
          ...opts,
        }).catch(() => null);

      const [bio, overview, stats] = await Promise.all([
        fetchJsonResilient<any>(`${commonPath(league)}/athletes/${id}`, undefined, { label: 'espn-soccer-athlete-bio', ...opts }),
        fetchJsonResilient<any>(`${commonPath(league)}/athletes/${id}/overview`, undefined, { label: 'espn-soccer-athlete-overview', ...opts }),
        fetchStats(),
      ]);

      if (!bio && !overview) {
        const siteV2 = await fetchJsonResilient<any>(
          `${basePath(league)}/athletes/${id}`,
          undefined,
          { label: 'espn-soccer-athlete-site-v2', ...opts },
        );
        if (siteV2) return { bio: siteV2, overview: siteV2, stats: stats ?? null };
      }

      if (!bio && !overview && !stats) return null;
      return { bio, overview, stats };
    },
    [`player:${id}`],
  );
}

export async function espnSoccerSearchAthletes(query: string, league = DEFAULT_SOCCER_LEAGUE): Promise<any[]> {
  const key = cacheKey('espn-soccer', league, 'search', query.toLowerCase());
  const result = await cachedFetch<any[]>(
    key,
    profileForResource('search'),
    async ({ bypassCache }) => {
      const data = await fetchJsonResilient<any>(
        `${commonPath(league)}/athletes?search=${encodeURIComponent(query)}&limit=10`,
        undefined,
        { label: 'espn-soccer-athlete-search', bypassCache },
      );
      return data?.items ?? data?.athletes ?? [];
    },
    ['search'],
  );
  return result ?? [];
}

function mapStatRow(labels: string[], values: (string | number)[]): StatItem[] {
  return labels.map((label, i) => ({ label, value: values[i] ?? '—' }));
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

export function parseEspnSoccerBoxScore(summary: any, awayTeam: Team, homeTeam: Team): GameBoxScore | undefined {
  const playerBlocks = summary?.boxscore?.players ?? [];
  if (!playerBlocks.length) return undefined;

  const buildSide = (side: 'away' | 'home', team: Team) => {
    const homeAway = side === 'home' ? 'home' : 'away';
    const block = playerBlocks.find((p: any) => p.homeAway === homeAway) ?? playerBlocks[side === 'away' ? 0 : 1];
    const teamBlock = summary?.boxscore?.teams?.find((t: any) => t.homeAway === homeAway);
    const totalsLabels: string[] = teamBlock?.statistics?.[0]?.labels ?? [];
    const totalsValues: string[] = teamBlock?.statistics?.[0]?.stats ?? [];

    return {
      team: { ...team, logo: resolveSoccerTeamLogo(team.abbr, team.logo) },
      players: parsePlayerBlock(block),
      totals: totalsLabels.length ? mapStatRow(totalsLabels, totalsValues) : [],
    };
  };

  return { away: buildSide('away', awayTeam), home: buildSide('home', homeTeam) };
}

export function parseEspnSoccerTeamStats(summary: any): { away: StatItem[]; home: StatItem[] } | undefined {
  const boxTeams = summary?.boxscore?.teams ?? [];
  const headerComp = summary?.header?.competitions?.[0];

  const fromBox = (homeAway: string): StatItem[] => {
    const team = boxTeams.find((t: any) => t.homeAway === homeAway);
    const stats = team?.statistics?.[0]?.stats ?? [];
    const labels = team?.statistics?.[0]?.labels ?? [];
    if (stats.length && labels.length) return mapStatRow(labels, stats).slice(0, 12);
    return (team?.statistics ?? [])
      .filter((s: any) => s.displayValue !== undefined)
      .map((s: any) => ({ label: s.name ?? s.abbreviation ?? s.displayName ?? '', value: s.displayValue }));
  };

  let away = fromBox('away');
  let home = fromBox('home');

  if ((!away.length || !home.length) && headerComp?.competitors) {
    const compStats = (homeAway: string) =>
      (headerComp.competitors.find((c: any) => c.homeAway === homeAway)?.statistics ?? [])
        .filter((s: any) => s.displayValue !== undefined)
        .map((s: any) => ({ label: s.name ?? s.abbreviation ?? '', value: s.displayValue }))
        .slice(0, 12);

    if (!away.length) away = compStats('away');
    if (!home.length) home = compStats('home');
  }

  if (!away.length && !home.length) return undefined;
  return { away, home };
}

export function parseEspnSoccerPlays(summary: any): PlayEvent[] {
  const keyEvents = summary?.keyEvents ?? summary?.commentary ?? [];
  const raw = Array.isArray(keyEvents) ? keyEvents : [];

  if (raw.length) {
    return [...raw].reverse().slice(0, 40).map((p: any, idx: number) => ({
      id: String(p.id ?? idx),
      period: p.period?.displayValue ?? p.period?.type ?? '',
      clock: p.clock?.displayValue ?? p.time?.displayValue ?? '',
      text: p.text ?? p.shortText ?? p.type?.text ?? '',
      teamAbbr: p.team?.abbreviation,
      scoringPlay: Boolean(p.scoringPlay ?? /goal/i.test(p.type?.text ?? p.text ?? '')),
    }));
  }

  const plays = summary?.plays ?? summary?.rosters?.events ?? [];
  if (!Array.isArray(plays) || !plays.length) return [];

  return [...plays].reverse().slice(0, 40).map((p: any, idx: number) => ({
    id: String(p.id ?? idx),
    period: p.period?.displayValue ?? '',
    clock: p.clock?.displayValue ?? '',
    text: p.text ?? p.shortText ?? '',
    teamAbbr: p.team?.abbreviation,
    scoringPlay: Boolean(p.scoringPlay),
  }));
}

export function parseEspnSoccerGameMeta(summary: any) {
  const comp = summary?.header?.competitions?.[0] ?? summary?.gameInfo;
  const broadcasts = comp?.broadcasts;
  const broadcastList = Array.isArray(broadcasts) ? broadcasts : [];
  return {
    venue: comp?.venue?.fullName ?? summary?.gameInfo?.venue?.fullName,
    broadcast: comp?.broadcast
      ?? broadcastList.find((b: any) => b.market === 'national')?.names?.join(', ')
      ?? broadcastList[0]?.names?.join(', '),
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

export function parseEspnSoccerTopPerformers(summary: any) {
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

      const goals = statValue(labels, stats, 'G', 'GL', 'GOALS');
      const assists = statValue(labels, stats, 'A', 'AST', 'ASSISTS');
      const shots = statValue(labels, stats, 'SH', 'SHT', 'SHOTS');
      const score = goals * 100 + assists * 50 + shots;

      const statItems: StatItem[] = [];
      const addStat = (label: string, ...keys: string[]) => {
        const idx = keys.map((k) => labels.indexOf(k)).find((i) => i >= 0);
        if (idx !== undefined && idx >= 0) statItems.push({ label, value: stats[idx] ?? '—' });
      };
      addStat('G', 'G', 'GL');
      addStat('A', 'A', 'AST');
      addStat('SH', 'SH', 'SHT');
      addStat('ST', 'ST', 'SOG');

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

export function parseEspnSoccerTeamsList(data: any) {
  const teamsList = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  return teamsList.map((t: any) => {
    const team = t.team ?? {};
    const abbr = team.abbreviation ?? team.shortDisplayName?.slice(0, 3)?.toUpperCase() ?? '—';
    return enrichSoccerTeam(abbr, {
      id: String(team.id),
      espnId: String(team.id),
      name: team.displayName ?? team.name,
      logo: team.logos?.[0]?.href,
      color: team.color ? `#${team.color}` : undefined,
      alternateColor: team.alternateColor ? `#${team.alternateColor}` : undefined,
    });
  });
}

export function parseEspnSoccerRoster(data: any) {
  const athletes = data?.athletes ?? data?.team?.athletes ?? [];
  return athletes.map((a: any) => {
    const athlete = a.athlete ?? a;
    return {
      id: String(athlete.id),
      name: athlete.displayName ?? athlete.fullName,
      position: athlete.position?.abbreviation ?? athlete.position?.name ?? '—',
      number: athlete.jersey,
      headshot: athlete.headshot?.href ?? athlete.headshot,
    };
  });
}

export function extractLeagueSlug(
  event: EspnScoreboardEvent | Record<string, unknown> | undefined,
  competition?: EspnCompetitionRef,
): string {
  return extractEspnLeagueSlug(event as EspnScoreboardEvent | undefined, competition, DEFAULT_SOCCER_LEAGUE);
}
