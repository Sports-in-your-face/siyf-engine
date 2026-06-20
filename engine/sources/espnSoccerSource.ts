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
import { fetchEspnCustomScoreboardSelfPatch } from '../core/scoreboardSelfPatch';
import type {
  BoxScorePlayer,
  GameBoxScore,
  PlayEvent,
  StandingsGroup,
  StatItem,
  Team,
} from '../core/types';
import { extractEspnLeagueSlug, getEspnEvents, type EspnCompetitionRef, type EspnScoreboardEvent } from '../core/espnEventTypes';
import { getSoccerScoreboardLeagues } from '../soccerLeagueFilter';
import { enrichSoccerTeam, resolveSoccerTeamLogo } from './teamRegistry';
import { parseEspnRosterResponse } from './espnRoster';
import { batchFetchPlayerStats, mergeRosterStats } from '../core/rosterSeasonStats';
import type { Game, Player } from '../../types';

export const DEFAULT_SOCCER_LEAGUE = 'eng.1';

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
    () => fetchEspnCustomScoreboardSelfPatch(`espn-soccer-${league}`, basePath(league), dates),
    ['scoreboard', `soccer:${league}`],
  );
}

/** Merged scoreboard for user-selected core domestic leagues (defaults to MLS). */
export async function espnSoccerMergedScoreboard(): Promise<{ events: any[]; leagues?: unknown } | null> {
  const slugs = getSoccerScoreboardLeagues();

  const boards = await Promise.all(
    slugs.map(async (slug) => {
      const raw = await espnSoccerScoreboard(slug);
      return { slug, raw, events: getEspnEvents(raw) };
    }),
  );

  const events = boards.flatMap((board) => board.events);
  if (!events.length) return null;

  const primary = boards.find((board) => board.events.length)?.raw;
  return {
    events,
    leagues: primary?.leagues,
  };
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
  if (!/^\d+$/.test(eventId)) return null;

  const key = cacheKey('espn-soccer', league, 'summary', eventId);
  return cachedFetch(
    key,
    profileForResource('summary', gameState),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${basePath(league)}/summary?event=${eventId}`, undefined, {
        label: `espn-soccer-summary-${eventId}`,
        retries: 1,
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
  if (!/^\d+$/.test(teamId)) return null;
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
    draws: parseInt(statVal('ties'), 10) || parseInt(statVal('D'), 10) || parseInt(statVal('draws'), 10) || 0,
    winPct: statVal('points') || statVal('Pts') || statVal('winPercent') || '.000',
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
      const [bio, overview, stats] = await Promise.all([
        fetchJsonResilient<any>(`${commonPath(league)}/athletes/${id}`, undefined, { label: 'espn-soccer-athlete-bio', ...opts }),
        fetchJsonResilient<any>(`${commonPath(league)}/athletes/${id}/overview`, undefined, { label: 'espn-soccer-athlete-overview', ...opts }),
        fetchJsonResilient<any>(`${commonPath(league)}/athletes/${id}/stats`, undefined, { label: 'espn-soccer-athlete-stats', ...opts }),
      ]);
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

export function parseEspnSoccerTeamsList(data: any, leagueSlug?: string) {
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
      leagueSlug,
    });
  });
}

export function parseEspnSoccerRoster(data: any) {
  return parseEspnRosterResponse(data).map((p) => ({
    ...p,
    stats: p.stats.length ? p.stats : undefined,
  }));
}

function parseSoccerSeasonAverages(statsRaw: any): StatItem[] {
  const averages = statsRaw?.categories?.find((c: any) => c.name === 'averages' || /stats/i.test(c.displayName ?? ''));
  const labels: string[] = averages?.labels ?? [];
  const entry = averages?.statistics?.[0];
  const values: (string | number)[] = entry?.stats ?? [];
  if (!labels.length || !values.length) {
    return emptySoccerSeasonPreviewStats();
  }
  const idx = (label: string) => labels.indexOf(label);
  const pick = (label: string) => {
    const i = idx(label);
    return i >= 0 ? String(values[i]) : undefined;
  };
  const items: StatItem[] = [];
  const gp = pick('GP') ?? pick('Apps');
  if (gp) items.push({ label: 'GP', value: gp });
  const g = pick('G') ?? pick('Goals');
  if (g) items.push({ label: 'G', value: g });
  const a = pick('A') ?? pick('Assists');
  if (a) items.push({ label: 'A', value: a });
  return items;
}

export async function enrichEspnSoccerRosterSeasonStats(roster: Player[]): Promise<Player[]> {
  const needsStats = roster.filter((p) => !p.stats.length);
  if (!needsStats.length) return roster;
  const statsById = await batchFetchPlayerStats(needsStats.map((p) => p.id), async (id) => {
    const player = needsStats.find((p) => p.id === id);
    const league = player?.leagueSport ?? DEFAULT_SOCCER_LEAGUE;
    const data = await espnSoccerAthlete(id, league);
    const stats = parseSoccerSeasonAverages(data?.stats);
    return stats.length ? stats : null;
  });
  return mergeRosterStats(roster, statsById);
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

function emptySoccerSeasonPreviewStats(): StatItem[] {
  return [
    { label: 'GP', value: '—' },
    { label: 'G', value: '—' },
    { label: 'A', value: '—' },
    { label: 'SH', value: '—' },
  ];
}

async function fetchSoccerSeasonAveragesForPlayers(
  playerIds: string[],
  league: string,
): Promise<Map<string, StatItem[]>> {
  return batchFetchPlayerStats(playerIds, async (id) => {
    const data = await espnSoccerAthlete(id, league);
    const stats = parseSoccerSeasonAverages(data?.stats);
    return stats.length ? stats : null;
  });
}

function internationalSoccerHint(game?: { subtitle?: string; context?: { headline?: string; badge?: string } }): boolean {
  const hint = `${game?.subtitle ?? ''} ${game?.context?.headline ?? ''} ${game?.context?.badge ?? ''}`.toLowerCase();
  return /world cup|fifa|international|group stage/i.test(hint);
}

function validSoccerLeagueSlug(slug: string | undefined): slug is string {
  if (!slug) return false;
  if (slug.includes('group')) return false;
  return /^[a-z0-9.]+$/i.test(slug);
}

function resolveSoccerRosterLeague(game?: { leagueSlug?: string; subtitle?: string; context?: { headline?: string; badge?: string } }): string {
  if (internationalSoccerHint(game)) return 'fifa.world';
  const slug = game?.leagueSlug;
  if (validSoccerLeagueSlug(slug)) return slug;
  return DEFAULT_SOCCER_LEAGUE;
}

export async function buildEspnSoccerPreGameBoxScore(
  summary: any,
  awayTeam: Team,
  homeTeam: Team,
  game?: Game,
): Promise<GameBoxScore | undefined> {
  const league = resolveSoccerRosterLeague(game);
  const competitors: any[] = summary?.header?.competitions?.[0]?.competitors ?? [];
  if (!competitors.length) return undefined;

  const buildSide = async (homeAway: 'away' | 'home', team: Team) => {
    const comp = competitors.find((c) => c.homeAway === homeAway);
    const rawId = String(comp?.team?.id ?? comp?.id ?? team.id ?? '');
    const teamId = /^\d+$/.test(rawId) ? rawId : '';
    if (!teamId) return null;

    const featuredIds = collectFeaturedPlayerIds(summary, teamId);
    let rosterData = await espnSoccerTeamRoster(teamId, league);
    if (!rosterData && league !== 'fifa.world') {
      rosterData = await espnSoccerTeamRoster(teamId, 'fifa.world');
    }
    const roster = parseEspnSoccerRoster(rosterData);
    if (!roster.length) return null;

    const seasonAvgs = await fetchSoccerSeasonAveragesForPlayers(roster.map((p) => p.id), league);
    const featuredSet = new Set(featuredIds);

    const players: BoxScorePlayer[] = roster.map((base, index) => ({
      ...base,
      starter: featuredSet.has(base.id) ? featuredIds.indexOf(base.id) < 11 : index < 11,
      stats: seasonAvgs.get(base.id) ?? emptySoccerSeasonPreviewStats(),
    }));

    if (!players.length) return null;

    return {
      team: { ...team, logo: resolveSoccerTeamLogo(team.abbr, team.logo) },
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

export function extractLeagueSlug(
  event: EspnScoreboardEvent | Record<string, unknown> | undefined,
  competition?: EspnCompetitionRef,
): string {
  return extractEspnLeagueSlug(event as EspnScoreboardEvent | undefined, competition, DEFAULT_SOCCER_LEAGUE);
}
