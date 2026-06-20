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
import { fetchEspnScoreboardSelfPatch } from '../core/scoreboardSelfPatch';
import { isEspnNumericEventId } from '../core/espnSummaryGuard';
import type {
  BoxScorePlayer,
  GameBoxScore,
  PlayEvent,
  StandingsGroup,
  StatItem,
  Team,
} from '../core/types';
import { enrichTeam, resolveTeamLogo } from './teamRegistry';
import { parseEspnRosterResponse } from './espnRoster';
import { batchFetchPlayerStats, mergeRosterStats } from '../core/rosterSeasonStats';
import type { Player } from '../../types';

const BASE = '/api/espn/apis/site/v2/sports/basketball/nba';
const COMMON = '/api/espn/apis/common/v3/sports/basketball/nba';
const WNBA_BASE = '/api/espn/apis/site/v2/sports/basketball/wnba';
const WNBA_COMMON = '/api/espn/apis/common/v3/sports/basketball/wnba';
const STANDINGS_ALT = '/api/espn/apis/v2/sports/basketball/nba/standings';

type BasketballLeague = 'nba' | 'wnba';

export function basketballLeagueFromGame(game?: { sport?: string }): BasketballLeague {
  return game?.sport === 'WNBA' ? 'wnba' : 'nba';
}

export async function espnScoreboard(dates?: string): Promise<any | null> {
  const key = cacheKey('espn', 'scoreboard', dates ?? 'today');
  return cachedFetch(
    key,
    profileForResource('scoreboard'),
    () => fetchEspnScoreboardSelfPatch('BASKETBALL', dates),
    ['scoreboard', 'nba'],
  );
}

export async function espnTeams(): Promise<any | null> {
  const key = cacheKey('espn', 'teams');
  return cachedFetch(
    key,
    profileForResource('teams'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${BASE}/teams`, undefined, { label: 'espn-teams', retries: 2, bypassCache }),
    ['teams', 'nba'],
  );
}

export async function espnSummary(eventId: string, gameState?: GameLiveState): Promise<any | null> {
  if (!isEspnNumericEventId(eventId)) return null;
  const key = cacheKey('espn', 'summary', eventId);
  const profile = profileForResource('summary', gameState);
  return cachedFetch(
    key,
    profile,
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${BASE}/summary?event=${eventId}`, undefined, {
        label: `espn-summary-${eventId}`,
        retries: 2,
        timeout: 10_000,
        bypassCache,
      }),
    [`game:${eventId}`],
  );
}

export async function espnWnbaSummary(eventId: string, gameState?: GameLiveState): Promise<any | null> {
  const key = cacheKey('espn-wnba', 'summary', eventId);
  const profile = profileForResource('summary', gameState);
  return cachedFetch(
    key,
    profile,
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${WNBA_BASE}/summary?event=${eventId}`, undefined, {
        label: `espn-wnba-summary-${eventId}`,
        retries: 2,
        timeout: 10_000,
        bypassCache,
      }),
    [`game:${eventId}`, 'wnba'],
  );
}

export function espnSummaryForGame(game: { id: string; statusState?: string; sport?: string }): Promise<any | null> {
  return basketballLeagueFromGame(game) === 'wnba'
    ? espnWnbaSummary(game.id, game.statusState as GameLiveState | undefined)
    : espnSummary(game.id, game.statusState as GameLiveState | undefined);
}

export async function espnTeamSchedule(teamId: string): Promise<any | null> {
  const key = cacheKey('espn', 'schedule', teamId);
  return cachedFetch(
    key,
    profileForResource('schedule'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${BASE}/teams/${teamId}/schedule`, undefined, {
        label: `espn-schedule-${teamId}`,
        bypassCache,
      }),
    [`team:${teamId}`, 'schedule'],
  );
}

export async function espnTeamRoster(teamId: string): Promise<any | null> {
  const key = cacheKey('espn', 'roster', teamId);
  return cachedFetch(
    key,
    profileForResource('roster'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${BASE}/teams/${teamId}/roster`, undefined, {
        label: `espn-roster-${teamId}`,
        bypassCache,
      }),
    [`team:${teamId}`, 'roster'],
  );
}

export async function espnWnbaTeamRoster(teamId: string): Promise<any | null> {
  const key = cacheKey('espn-wnba', 'roster', teamId);
  return cachedFetch(
    key,
    profileForResource('roster'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${WNBA_BASE}/teams/${teamId}/roster`, undefined, {
        label: `espn-wnba-roster-${teamId}`,
        bypassCache,
      }),
    [`team:${teamId}`, 'roster', 'wnba'],
  );
}

function espnTeamRosterForLeague(teamId: string, league: BasketballLeague): Promise<any | null> {
  return league === 'wnba' ? espnWnbaTeamRoster(teamId) : espnTeamRoster(teamId);
}

export async function espnWnbaTeamSchedule(teamId: string): Promise<any | null> {
  const key = cacheKey('espn-wnba', 'schedule', teamId);
  return cachedFetch(
    key,
    profileForResource('schedule'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${WNBA_BASE}/teams/${teamId}/schedule`, undefined, {
        label: `espn-wnba-schedule-${teamId}`,
        bypassCache,
      }),
    [`team:${teamId}`, 'schedule', 'wnba'],
  );
}

export async function espnStandings(): Promise<StandingsGroup[]> {
  const key = cacheKey('espn', 'standings');
  const cached = cacheGet<StandingsGroup[]>(key);
  if (cached?.length) return cached;

  const data =
    (await fetchJsonResilient<any>(`${BASE}/standings`, undefined, { label: 'espn-standings' })) ??
    (await fetchJsonResilient<any>(STANDINGS_ALT, undefined, { label: 'espn-standings-alt' }));

  if (!data) return cacheGetStale<StandingsGroup[]>(key) ?? [];

  const children = data.children ?? data.standings?.children ?? [];
  if (!children.length) return cacheGetStale<StandingsGroup[]>(key) ?? [];

  const groups: StandingsGroup[] = children.map((conf: any) => ({
    name: conf.name ?? conf.abbreviation ?? 'Conference',
    rows: (conf.standings?.entries ?? conf.entries ?? []).map((entry: any, idx: number) => {
      const team = entry.team ?? {};
      const stats = entry.stats ?? [];
      const statVal = (name: string) =>
        stats.find((s: any) => s.name === name || s.type === name || s.abbreviation === name)?.displayValue ?? '0';

      const abbr = team.abbreviation ?? '—';
      const resolved = enrichTeam(abbr, {
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

  cacheSetWithProfile(key, groups, profileForResource('standings'), ['standings', 'nba']);
  return groups;
}

export async function espnAthlete(id: string): Promise<any | null> {
  const key = cacheKey('espn', 'athlete', id);
  return cachedFetch(
    key,
    profileForResource('athlete'),
    async ({ bypassCache }) => {
      const opts = { bypassCache };
      const [bio, overview, stats] = await Promise.all([
        fetchJsonResilient<any>(`${COMMON}/athletes/${id}`, undefined, { label: 'espn-athlete-bio', ...opts }),
        fetchJsonResilient<any>(`${COMMON}/athletes/${id}/overview`, undefined, { label: 'espn-athlete-overview', ...opts }),
        fetchJsonResilient<any>(`${COMMON}/athletes/${id}/stats`, undefined, { label: 'espn-athlete-stats', ...opts }),
      ]);
      if (!bio && !overview && !stats) return null;
      return { bio, overview, stats };
    },
    [`player:${id}`],
  );
}

export async function espnWnbaAthlete(id: string): Promise<any | null> {
  const key = cacheKey('espn-wnba', 'athlete', id);
  return cachedFetch(
    key,
    profileForResource('athlete'),
    async ({ bypassCache }) => {
      const opts = { bypassCache };
      const [bio, overview, stats] = await Promise.all([
        fetchJsonResilient<any>(`${WNBA_COMMON}/athletes/${id}`, undefined, { label: 'espn-wnba-athlete-bio', ...opts }),
        fetchJsonResilient<any>(`${WNBA_COMMON}/athletes/${id}/overview`, undefined, { label: 'espn-wnba-athlete-overview', ...opts }),
        fetchJsonResilient<any>(`${WNBA_COMMON}/athletes/${id}/stats`, undefined, { label: 'espn-wnba-athlete-stats', ...opts }),
      ]);
      if (!bio && !overview && !stats) return null;
      return { bio, overview, stats };
    },
    [`player:${id}`, 'wnba'],
  );
}

export async function espnSearchAthletes(query: string): Promise<any[]> {
  const key = cacheKey('espn', 'search', query.toLowerCase());
  const result = await cachedFetch<any[]>(
    key,
    profileForResource('search'),
    async ({ bypassCache }) => {
      const data = await fetchJsonResilient<any>(
        `${COMMON}/athletes?search=${encodeURIComponent(query)}&limit=10`,
        undefined,
        { label: 'espn-athlete-search', bypassCache },
      );
      return data?.items ?? data?.athletes ?? [];
    },
    ['search'],
  );
  return result ?? [];
}

const STAT_LABEL_MAP: Record<string, string> = {
  avgPointsAgainst: 'Avg Pts Allowed',
  avgPointsFor: 'Avg Pts Scored',
  threePointFieldGoalPct: '3PT FG%',
  fieldGoalPct: 'FG%',
  freeThrowPct: 'FT%',
  avgTeamTurnovers: 'Avg Turnovers',
  avgTeamRebounds: 'Avg Rebounds',
  avgTeamAssists: 'Avg Assists',
};

function humanizeStatLabel(raw: string): string {
  if (STAT_LABEL_MAP[raw]) return STAT_LABEL_MAP[raw];
  if (/^[A-Z0-9%]+$/.test(raw)) return raw;
  const spaced = raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/Pct$/i, ' %')
    .replace(/Avg /i, 'Avg ')
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

const SEASON_PREVIEW_LABELS = ['MPG', 'PPG', 'RPG', 'APG'] as const;

function emptySeasonPreviewStats(): StatItem[] {
  return SEASON_PREVIEW_LABELS.map((label) => ({ label, value: '—' }));
}

function parseCurrentSeasonAverages(statsRaw: any): StatItem[] {
  const averages = statsRaw?.categories?.find((c: any) => c.name === 'averages');
  const labels: string[] = averages?.labels ?? [];
  const entry = averages?.statistics?.[0];
  const values: (string | number)[] = entry?.stats ?? [];
  if (!labels.length || !values.length) return emptySeasonPreviewStats();

  const idx = (label: string) => labels.indexOf(label);
  return [
    { label: 'MPG', value: String(values[idx('MIN')] ?? '—') },
    { label: 'PPG', value: String(values[idx('PTS')] ?? '—') },
    { label: 'RPG', value: String(values[idx('REB')] ?? '—') },
    { label: 'APG', value: String(values[idx('AST')] ?? '—') },
  ];
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

async function fetchSeasonAveragesForPlayers(
  playerIds: string[],
  league: BasketballLeague = 'nba',
): Promise<Map<string, StatItem[]>> {
  const fetchAthlete = league === 'wnba' ? espnWnbaAthlete : espnAthlete;
  return batchFetchPlayerStats(playerIds, async (id) => {
    const data = await fetchAthlete(id);
    const avgs = parseCurrentSeasonAverages(data?.stats);
    return avgs.some((s) => s.value !== '—') ? avgs : null;
  });
}

export async function enrichEspnNbaRosterSeasonStats(roster: Player[]): Promise<Player[]> {
  const needsStats = roster.filter((p) => !p.stats.length);
  if (!needsStats.length) return roster;

  const nbaIds = needsStats.filter((p) => p.leagueSport !== 'WNBA').map((p) => p.id);
  const wnbaIds = needsStats.filter((p) => p.leagueSport === 'WNBA').map((p) => p.id);
  const [nbaStats, wnbaStats] = await Promise.all([
    nbaIds.length ? fetchSeasonAveragesForPlayers(nbaIds, 'nba') : Promise.resolve(new Map()),
    wnbaIds.length ? fetchSeasonAveragesForPlayers(wnbaIds, 'wnba') : Promise.resolve(new Map()),
  ]);
  const statsById = new Map<string, StatItem[]>([...nbaStats, ...wnbaStats]);
  return mergeRosterStats(roster, statsById);
}

export async function buildEspnPreGameBoxScore(
  summary: any,
  awayTeam: Team,
  homeTeam: Team,
  game?: { sport?: string },
): Promise<GameBoxScore | undefined> {
  const league = basketballLeagueFromGame(game);
  const competitors: any[] = summary?.header?.competitions?.[0]?.competitors ?? [];
  if (!competitors.length) return undefined;

  const buildSide = async (homeAway: 'away' | 'home', team: Team) => {
    const comp = competitors.find((c) => c.homeAway === homeAway);
    const teamId = String(comp?.team?.id ?? comp?.id ?? '');
    if (!teamId) return null;

    const featuredIds = collectFeaturedPlayerIds(summary, teamId);
    const rosterData = await espnTeamRosterForLeague(teamId, league);
    const roster = parseEspnRoster(rosterData);
    if (!roster.length) return null;

    const seasonAvgs = await fetchSeasonAveragesForPlayers(
      featuredIds.length
        ? [...new Set([...featuredIds, ...roster.slice(0, 5).map((p) => p.id)])]
        : roster.slice(0, 5).map((p) => p.id),
      league,
    );
    const featuredSet = new Set(featuredIds);

    const players: BoxScorePlayer[] = roster.map((base, index) => ({
      ...base,
      starter: featuredSet.has(base.id) ? featuredIds.indexOf(base.id) < 5 : index < 5,
      stats: seasonAvgs.get(base.id) ?? emptySeasonPreviewStats(),
    }));

    if (!players.length) return null;

    return {
      team: { ...team, logo: resolveTeamLogo(team.abbr, team.logo) },
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

export function parseEspnBoxScore(summary: any, awayTeam: Team, homeTeam: Team): GameBoxScore | undefined {
  const playerBlocks = summary?.boxscore?.players ?? [];
  if (!playerBlocks.length) return undefined;

  const buildSide = (side: 'away' | 'home', team: Team) => {
    const homeAway = side === 'home' ? 'home' : 'away';
    const block = playerBlocks.find((p: any) => p.homeAway === homeAway) ?? playerBlocks[side === 'away' ? 0 : 1];
    const teamBlock = summary?.boxscore?.teams?.find((t: any) => t.homeAway === homeAway);
    const totalsLabels: string[] = teamBlock?.statistics?.[0]?.labels ?? [];
    const totalsValues: string[] = teamBlock?.statistics?.[0]?.stats ?? [];

    return {
      team: { ...team, logo: resolveTeamLogo(team.abbr, team.logo) },
      players: parsePlayerBlock(block),
      totals: totalsLabels.length ? mapStatRow(totalsLabels, totalsValues) : [],
    };
  };

  const result: GameBoxScore = { away: buildSide('away', awayTeam), home: buildSide('home', homeTeam) };
  const hasLive = result.away.players.concat(result.home.players).some((p) => {
    const min = p.stats.find((s) => s.label.toUpperCase() === 'MIN')?.value;
    return min && min !== '—' && min !== '0' && parseFloat(String(min)) > 0;
  });
  if (hasLive) result.mode = 'live';
  return result;
}

export function parseEspnTeamStats(summary: any): { away: StatItem[]; home: StatItem[] } | undefined {
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

  // Supplement from header competitor statistics
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

export function parseEspnPlays(summary: any): PlayEvent[] {
  const plays = summary?.plays ?? [];
  if (!Array.isArray(plays) || !plays.length) return [];

  return [...plays].reverse().slice(0, 40).map((p: any, idx: number) => ({
    id: String(p.id ?? idx),
    period: p.period?.displayValue ?? (p.period?.number ? `Q${p.period.number}` : ''),
    clock: p.clock?.displayValue ?? '',
    text: p.text ?? p.shortText ?? p.type?.text ?? '',
    teamAbbr: p.team?.abbreviation,
    scoringPlay: Boolean(p.scoringPlay),
  }));
}

export function parseEspnGameMeta(summary: any) {
  const comp = summary?.header?.competitions?.[0] ?? summary?.gameInfo;
  return {
    venue: comp?.venue?.fullName ?? summary?.gameInfo?.venue?.fullName,
    broadcast: comp?.broadcasts?.[0]?.names?.join(', ') ?? comp?.broadcast,
    attendance: comp?.attendance ? String(comp.attendance) : undefined,
  };
}

export function parseEspnTopPerformers(summary: any) {
  const playerBlocks = summary?.boxscore?.players ?? [];
  if (!playerBlocks.length) return [];

  const performers: { id: string; name: string; team: string; position: string; headshot?: string; stats: StatItem[]; pts: number }[] = [];

  for (const block of playerBlocks) {
    const labels: string[] = block?.statistics?.[0]?.labels ?? [];
    const ptsIdx = labels.indexOf('PTS');
    const teamAbbr = block?.team?.abbreviation ?? '—';

    for (const entry of block?.statistics?.[0]?.athletes ?? []) {
      const athlete = entry.athlete ?? {};
      const stats = entry.stats ?? [];
      const pts = ptsIdx >= 0 ? parseInt(String(stats[ptsIdx] ?? 0), 10) : 0;
      if (!athlete.displayName) continue;

      performers.push({
        id: String(athlete.id),
        name: athlete.displayName,
        team: teamAbbr,
        position: athlete.position?.abbreviation ?? '—',
        headshot: athlete.headshot?.href,
        stats: ['PTS', 'REB', 'AST'].map((label) => {
          const idx = labels.indexOf(label);
          return { label, value: idx >= 0 ? stats[idx] ?? '—' : '—' };
        }),
        pts: Number.isNaN(pts) ? 0 : pts,
      });
    }
  }

  return performers.sort((a, b) => b.pts - a.pts).slice(0, 8);
}

export function parseEspnTeamsList(data: any) {
  const teamsList = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  return teamsList.map((t: any) => {
    const team = t.team ?? {};
    const abbr = team.abbreviation ?? '—';
    return enrichTeam(abbr, {
      id: String(team.id),
      espnId: String(team.id),
      name: team.displayName ?? team.name,
      logo: team.logos?.[0]?.href,
      color: team.color ? `#${team.color}` : undefined,
      alternateColor: team.alternateColor ? `#${team.alternateColor}` : undefined,
    });
  });
}

export function parseEspnRoster(data: any): Array<{
  id: string;
  name: string;
  position: string;
  number?: string;
  headshot?: string;
  height?: string;
  weight?: string;
  age?: string;
  injuryStatus?: string;
  stats?: StatItem[];
}> {
  return parseEspnRosterResponse(data).map((p) => ({
    ...p,
    stats: p.stats.length ? p.stats : undefined,
  }));
}
