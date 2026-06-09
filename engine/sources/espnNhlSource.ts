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
import { enrichNhlTeam, resolveNhlTeamLogo } from './teamRegistry';

const BASE = '/api/espn/apis/site/v2/sports/hockey/nhl';
const COMMON = '/api/espn/apis/common/v3/sports/hockey/nhl';
const STANDINGS_ALT = '/api/espn/apis/v2/sports/hockey/nhl/standings';

export async function espnNhlScoreboard(dates?: string): Promise<any | null> {
  const key = cacheKey('espn-nhl', 'scoreboard', dates ?? 'today');
  return cachedFetch(
    key,
    profileForResource('scoreboard'),
    ({ bypassCache }) => {
      const url = dates ? `${BASE}/scoreboard?dates=${dates}` : `${BASE}/scoreboard`;
      return fetchJsonResilient<any>(url, undefined, { label: 'espn-nhl-scoreboard', retries: 2, bypassCache });
    },
    ['scoreboard', 'nhl'],
  );
}

export async function espnNhlTeams(): Promise<any | null> {
  const key = cacheKey('espn-nhl', 'teams');
  return cachedFetch(
    key,
    profileForResource('teams'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${BASE}/teams`, undefined, { label: 'espn-nhl-teams', retries: 2, bypassCache }),
    ['teams', 'nhl'],
  );
}

export async function espnNhlSummary(eventId: string, gameState?: GameLiveState): Promise<any | null> {
  const key = cacheKey('espn-nhl', 'summary', eventId);
  return cachedFetch(
    key,
    profileForResource('summary', gameState),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${BASE}/summary?event=${eventId}`, undefined, {
        label: `espn-nhl-summary-${eventId}`,
        retries: 2,
        timeout: 10_000,
        bypassCache,
      }),
    [`game:${eventId}`],
  );
}

export async function espnNhlTeamSchedule(teamId: string): Promise<any | null> {
  const key = cacheKey('espn-nhl', 'schedule', teamId);
  return cachedFetch(
    key,
    profileForResource('schedule'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${BASE}/teams/${teamId}/schedule`, undefined, {
        label: `espn-nhl-schedule-${teamId}`,
        bypassCache,
      }),
    [`team:${teamId}`, 'schedule'],
  );
}

export async function espnNhlTeamRoster(teamId: string): Promise<any | null> {
  const key = cacheKey('espn-nhl', 'roster', teamId);
  return cachedFetch(
    key,
    profileForResource('roster'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${BASE}/teams/${teamId}/roster`, undefined, {
        label: `espn-nhl-roster-${teamId}`,
        bypassCache,
      }),
    [`team:${teamId}`, 'roster'],
  );
}

export async function espnNhlStandings(): Promise<StandingsGroup[]> {
  const key = cacheKey('espn-nhl', 'standings');
  const cached = cacheGet<StandingsGroup[]>(key);
  if (cached?.length) return cached;

  const data =
    (await fetchJsonResilient<any>(`${BASE}/standings`, undefined, { label: 'espn-nhl-standings' })) ??
    (await fetchJsonResilient<any>(STANDINGS_ALT, undefined, { label: 'espn-nhl-standings-alt' }));

  if (!data) return cacheGetStale<StandingsGroup[]>(key) ?? [];

  const children = data.children ?? data.standings?.children ?? [];
  if (!children.length) return cacheGetStale<StandingsGroup[]>(key) ?? [];

  const groups: StandingsGroup[] = children.map((conf: any) => ({
    name: conf.name ?? conf.abbreviation ?? 'Division',
    rows: (conf.standings?.entries ?? conf.entries ?? []).map((entry: any, idx: number) => {
      const team = entry.team ?? {};
      const stats = entry.stats ?? [];
      const statVal = (name: string) =>
        stats.find((s: any) => s.name === name || s.type === name || s.abbreviation === name)?.displayValue ?? '0';

      const abbr = team.abbreviation ?? '—';
      const resolved = enrichNhlTeam(abbr, {
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

  cacheSetWithProfile(key, groups, profileForResource('standings'), ['standings', 'Nhl']);
  return groups;
}

export async function espnNhlAthlete(id: string): Promise<any | null> {
  const key = cacheKey('espn-nhl', 'athlete', id);
  return cachedFetch(
    key,
    profileForResource('athlete'),
    async ({ bypassCache }) => {
      const opts = { bypassCache };
      const [bio, overview, stats] = await Promise.all([
        fetchJsonResilient<any>(`${COMMON}/athletes/${id}`, undefined, { label: 'espn-nhl-athlete-bio', ...opts }),
        fetchJsonResilient<any>(`${COMMON}/athletes/${id}/overview`, undefined, { label: 'espn-nhl-athlete-overview', ...opts }),
        fetchJsonResilient<any>(`${COMMON}/athletes/${id}/stats`, undefined, { label: 'espn-nhl-athlete-stats', ...opts }),
      ]);
      if (!bio && !overview && !stats) return null;
      return { bio, overview, stats };
    },
    [`player:${id}`],
  );
}

export async function espnNhlSearchAthletes(query: string): Promise<any[]> {
  const key = cacheKey('espn-nhl', 'search', query.toLowerCase());
  const result = await cachedFetch<any[]>(
    key,
    profileForResource('search'),
    async ({ bypassCache }) => {
      const data = await fetchJsonResilient<any>(
        `${COMMON}/athletes?search=${encodeURIComponent(query)}&limit=10`,
        undefined,
        { label: 'espn-nhl-athlete-search', bypassCache },
      );
      return data?.items ?? data?.athletes ?? [];
    },
    ['search'],
  );
  return result ?? [];
}

const STAT_LABEL_MAP: Record<string, string> = {
  goals: 'G',
  assists: 'A',
  points: 'PTS',
  shotsOnGoal: 'SOG',
  hits: 'HIT',
  blockedShots: 'BLK',
  savePct: 'SV%',
  goalsAgainst: 'GA',
  powerPlayPct: 'PP%',
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

export function parseEspnNhlBoxScore(summary: any, awayTeam: Team, homeTeam: Team): GameBoxScore | undefined {
  const playerBlocks = summary?.boxscore?.players ?? [];
  if (!playerBlocks.length) return undefined;

  const buildSide = (side: 'away' | 'home', team: Team) => {
    const homeAway = side === 'home' ? 'home' : 'away';
    const block = playerBlocks.find((p: any) => p.homeAway === homeAway) ?? playerBlocks[side === 'away' ? 0 : 1];
    const teamBlock = summary?.boxscore?.teams?.find((t: any) => t.homeAway === homeAway);
    const totalsLabels: string[] = teamBlock?.statistics?.[0]?.labels ?? [];
    const totalsValues: string[] = teamBlock?.statistics?.[0]?.stats ?? [];

    return {
      team: { ...team, logo: resolveNhlTeamLogo(team.abbr, team.logo) },
      players: parsePlayerBlock(block),
      totals: totalsLabels.length ? mapStatRow(totalsLabels, totalsValues) : [],
    };
  };

  return { away: buildSide('away', awayTeam), home: buildSide('home', homeTeam) };
}

export function parseEspnNhlTeamStats(summary: any): { away: StatItem[]; home: StatItem[] } | undefined {
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

export function parseEspnNhlPlays(summary: any): PlayEvent[] {
  const scoringPlays = summary?.scoringPlays ?? [];
  const allPlays = summary?.plays ?? [];
  const rawPlays = allPlays.length > 0
    ? [...allPlays].sort((a: any, b: any) => (b.sequenceNumber ?? 0) - (a.sequenceNumber ?? 0))
    : scoringPlays;

  if (!Array.isArray(rawPlays) || !rawPlays.length) return [];

  const scoringIds = new Set(scoringPlays.map((p: any) => String(p.id ?? '')));

  return rawPlays.slice(0, 40).map((p: any, idx: number) => ({
    id: String(p.id ?? idx),
    period: p.period?.displayValue ?? (p.period?.number ? `P${p.period.number}` : ''),
    clock: p.clock?.displayValue ?? '',
    text: p.text ?? p.shortText ?? p.type?.text ?? '',
    teamAbbr: p.team?.abbreviation,
    scoringPlay: scoringIds.has(String(p.id ?? '')) || Boolean(p.scoringPlay) || /goal/i.test(p.type?.text ?? p.text ?? ''),
  }));
}

export function parseEspnNhlGameMeta(summary: any) {
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

export function parseEspnNhlTopPerformers(summary: any) {
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

      const goals = statValue(labels, stats, 'G'); const assists = statValue(labels, stats, 'A'); const pts = statValue(labels, stats, 'PTS'); const sog = statValue(labels, stats, 'SOG'); const score = pts * 50 + goals * 30 + assists * 20 + sog * 5;

      const statItems: StatItem[] = [];
      const addStat = (label: string, ...keys: string[]) => {
        const idx = keys.map((k) => labels.indexOf(k)).find((i) => i >= 0);
        if (idx !== undefined && idx >= 0) statItems.push({ label, value: stats[idx] ?? '—' });
      };
      addStat('G', 'G'); addStat('A', 'A'); addStat('PTS', 'PTS'); addStat('SOG', 'SOG'); addStat('HIT', 'HIT'); addStat('BLK', 'BLK');

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

export function parseEspnNhlTeamsList(data: any) {
  const teamsList = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  return teamsList.map((t: any) => {
    const team = t.team ?? {};
    const abbr = team.abbreviation ?? '—';
    return enrichNhlTeam(abbr, {
      id: String(team.id),
      espnId: String(team.id),
      name: team.displayName ?? team.name,
      logo: team.logos?.[0]?.href,
      color: team.color ? `#${team.color}` : undefined,
      alternateColor: team.alternateColor ? `#${team.alternateColor}` : undefined,
    });
  });
}

export function parseEspnNhlRoster(data: any) {
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

function collectFeaturedPlayerIds(summary: any, teamId: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const teamBlock of summary?.leaders ?? []) {
    const blockTeamId = String(teamBlock?.team?.id ?? '');
    if (blockTeamId && blockTeamId !== teamId) continue;

    for (const category of teamBlock?.leaders ?? []) {
      for (const leader of category?.leaders ?? []) {
        const id = leader?.athlete?.id;
        if (!id) continue;
        const sid = String(id);
        if (seen.has(sid)) continue;
        seen.add(sid);
        ids.push(sid);
      }
    }
  }

  return ids.slice(0, 8);
}

function parseNhlSeasonAverages(statsRaw: any): StatItem[] {
  const averages = statsRaw?.categories?.find((c: any) => c.name === 'averages' || c.displayName === 'Regular Season Averages');
  const labels: string[] = averages?.labels ?? [];
  const entry = averages?.statistics?.[0];
  const values: (string | number)[] = entry?.stats ?? [];
  if (!labels.length || !values.length) {
    return [
      { label: 'GP', value: '—' },
      { label: 'G', value: '—' },
      { label: 'A', value: '—' },
      { label: 'PTS', value: '—' },
    ];
  }

  const idx = (label: string) => labels.indexOf(label);
  return [
    { label: 'GP', value: String(values[idx('GP')] ?? values[idx('Games')] ?? '—') },
    { label: 'G', value: String(values[idx('G')] ?? values[idx('Goals')] ?? '—') },
    { label: 'A', value: String(values[idx('A')] ?? values[idx('Assists')] ?? '—') },
    { label: 'PTS', value: String(values[idx('PTS')] ?? values[idx('Points')] ?? '—') },
    { label: 'SOG', value: String(values[idx('SOG')] ?? values[idx('Shots')] ?? '—') },
  ].filter((s) => s.value !== '—');
}

async function fetchNhlSeasonAveragesForPlayers(playerIds: string[]): Promise<Map<string, StatItem[]>> {
  const result = new Map<string, StatItem[]>();
  const BATCH = 4;

  for (let i = 0; i < playerIds.length; i += BATCH) {
    const batch = playerIds.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (id) => {
        try {
          const data = await espnNhlAthlete(id);
          const avgs = parseNhlSeasonAverages(data?.stats);
          if (avgs.length) result.set(id, avgs);
        } catch {
          /* skip failed athlete fetch */
        }
      }),
    );
  }

  return result;
}

export async function buildEspnNhlPreGameBoxScore(
  summary: any,
  awayTeam: Team,
  homeTeam: Team,
): Promise<GameBoxScore | undefined> {
  const competitors: any[] = summary?.header?.competitions?.[0]?.competitors ?? [];
  if (!competitors.length) return undefined;

  const buildSide = async (homeAway: 'away' | 'home', team: Team) => {
    const comp = competitors.find((c) => c.homeAway === homeAway);
    const teamId = String(comp?.team?.id ?? comp?.id ?? '');
    if (!teamId) return null;

    const featuredIds = collectFeaturedPlayerIds(summary, teamId);
    const [rosterData, seasonAvgs] = await Promise.all([
      espnNhlTeamRoster(teamId),
      fetchNhlSeasonAveragesForPlayers(featuredIds),
    ]);

    const roster = parseEspnNhlRoster(rosterData);
    if (!roster.length && !featuredIds.length) return null;

    const rosterById = new Map(roster.map((p: { id: string }) => [p.id, p]));
    const orderedIds = featuredIds.length
      ? featuredIds
      : roster.slice(0, 8).map((p: { id: string }) => p.id);

    const players: BoxScorePlayer[] = orderedIds
      .map((id: string, index: number) => {
        const base = rosterById.get(id);
        if (!base) return null;
        return {
          ...base,
          starter: index < 6,
          stats: seasonAvgs.get(id) ?? parseNhlSeasonAverages(null),
        };
      })
      .filter(Boolean) as BoxScorePlayer[];

    if (!players.length) return null;

    return {
      team: { ...team, logo: resolveNhlTeamLogo(team.abbr, team.logo) },
      players,
      totals: [],
    };
  };

  const [away, home] = await Promise.all([
    buildSide('away', awayTeam),
    buildSide('home', homeTeam),
  ]);

  if (!away?.players.length && !home?.players.length) return undefined;
  return {
    mode: 'season',
    away: away ?? { team: awayTeam, players: [], totals: [] },
    home: home ?? { team: homeTeam, players: [], totals: [] },
  };
}
