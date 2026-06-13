import { getSportProfile } from '../config/sportProfiles';
import { resolveProxyUrl } from '../config/siyfApi';
import { APP_SPORT_TO_CDN } from '../config/siyfCdn';
import { enrichGamesTeamsFromCdn, loadCdnTeamsForSport } from '../engine/sources/cdnTeamAssets';
import { ensureTeamRegistry } from '../engine/sources/teamRegistry';
import type {
  Game,
  Player,
  PlayerAward,
  PlayerDetails,
  PlayerGameLogRow,
  PlayerSeasonRow,
  PlayerStatSplit,
  StatItem,
} from '../types';
import { getEspnEvents } from '../engine/core/espnEventTypes';
import { parseEventsForSport } from './parsers/parseGameEvent';
import { parseEventsWithHashGate, requestBypassHashGate } from '../engine/core/deltaHash';
import { coalesceKeyFetchGames, dedupeRequest } from '../engine/core/resilientFetch';
import { coerceDisplayString } from '../utils/coerce';
import { getTeamAccent } from '../utils/teamColors';
import { filterRecentGames } from '../utils/gameFilters';
import { dedupeGamesById } from '../engine/core/mergeGames';
import { getEngine, type EngineSport, type ResolvedTeam, type StandingsGroup } from '../engine';
import { getSportCapabilities } from '../engine/core/sportCapabilities';
import { isEngineSport } from '../engine/engineSports';
import { CACHE_PROFILES } from '../engine/core/cacheTiers';
import { sessionGet, sessionSet } from '../engine/core/sessionPersist';
import type { LeagueContext } from '../types';
import {
  espnNflDraft,
  espnNflLeaders,
  espnNflScoreboard,
  espnNflWeekScoreboard,
  parseEspnNflDraft,
  parseEspnNflStatLeaders,
  type NflDraftBoard,
  type NflStatCategory,
} from '../engine/sources/espnNflSource';
import { espnNbaLeaders, parseEspnNbaStatLeaders, espnWnbaTeamRoster, espnWnbaTeamSchedule, espnWnbaTeams, parseEspnRoster } from '../engine/sources/espnSource';
import { espnMlbLeaders, parseEspnMlbStatLeaders } from '../engine/sources/espnMlbSource';
import { espnMlsLeaders, parseEspnMlsStatLeaders } from '../engine/sources/espnSoccerSource';
import {
  espnGolfLeaders,
  parseEspnGolfStatLeaders,
  espnLpgaScoreboard,
  espnPgaScoreboard,
  parseGolfScoreboardEvents,
  type GolfStatLeaderCategory,
} from '../engine/sources/espnGolfSource';
import {
  espnAtpScoreboard,
  espnWtaScoreboard,
  parseTennisScoreboardEvents,
} from '../engine/sources/espnTennisSource';
import { espnNhlLeaders, parseEspnNhlStatLeaders } from '../engine/sources/espnNhlSource';
import type { StatLeaderCategory } from '../engine/sources/espnStatLeaders';

export const SPORT_ENDPOINTS = {
  BASKETBALL: '/api/espn/apis/site/v2/sports/basketball/nba/scoreboard',
  FOOTBALL: '/api/espn/apis/site/v2/sports/football/nfl/scoreboard',
  SOCCER: '/api/espn/apis/site/v2/sports/soccer/eng.1/scoreboard',
  BASEBALL: '/api/espn/apis/site/v2/sports/baseball/mlb/scoreboard',
  HOCKEY: '/api/espn/apis/site/v2/sports/hockey/nhl/scoreboard',
  GOLF: '/api/espn/apis/site/v2/sports/golf/pga/scoreboard',
  TENNIS: '/api/espn/apis/site/v2/sports/tennis/atp/scoreboard',
  FIGHTS: '/api/espn/apis/site/v2/sports/mma/ufc/scoreboard',
};

export type SportType = keyof typeof SPORT_ENDPOINTS;

export interface FetchGamesOptions {
  /** Skip in-memory and edge cache for this scoreboard fetch (resume burst). */
  bypassCache?: boolean;
  /** Force re-parse even when raw ESPN event JSON is unchanged. */
  bypassHashGate?: boolean;
}

export async function fetchGames(sport: SportType, options?: FetchGamesOptions): Promise<Game[]> {
  return dedupeRequest(coalesceKeyFetchGames(sport, options), () => fetchGamesOnce(sport, options));
}

async function fetchGamesOnce(sport: SportType, options?: FetchGamesOptions): Promise<Game[]> {
  if (isEngineSport(sport)) {
    try {
      if (options?.bypassCache) getEngine(sport).bustScoreboardCache();
      if (options?.bypassCache || options?.bypassHashGate) requestBypassHashGate();
      const { data } = await getEngine(sport).getScoreboard();
      return filterRecentGames(dedupeGamesById(data));
    } catch (err) {
      console.error(`${sport} engine error:`, err);
      return [];
    }
  }

  try {
    const endpoint = SPORT_ENDPOINTS[sport];
    if (!endpoint) return [];
    const url = resolveProxyUrl(endpoint);
    const extraHeaders: Record<string, string> = {};
    if (options?.bypassCache) extraHeaders['X-SIYF-Bypass-Cache'] = '1';
    const res = await fetch(url, {
      headers: { Accept: 'application/json', ...extraHeaders },
    });
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();
    const cdnKey = APP_SPORT_TO_CDN[sport];
    if (cdnKey) await ensureTeamRegistry(cdnKey);
    const events = getEspnEvents(data);
    const parsed = parseEventsWithHashGate(events, sport);
    const games = filterRecentGames(
      dedupeGamesById(cdnKey ? enrichGamesTeamsFromCdn(sport, parsed) : parsed),
    );
    return games;
  } catch (err) {
    console.error('API Error:', err);
    return [];
  }
}

export async function fetchGameDetail(game: Game, sport: SportType): Promise<Game> {
  if (isEngineSport(sport)) {
    try {
      const { data } = await getEngine(sport).getGameDetail(game);
      return data;
    } catch (err) {
      console.warn(`${sport} game detail error (${game.id}):`, err);
      return game;
    }
  }
  return game;
}

export interface SelectableTeam {
  id: string;
  espnId?: string;
  sport: SportType;
  name: string;
  abbr: string;
  logo?: string;
  color?: string;
  note?: string;
}

export interface TeamFetchOptions {
  leagueTag?: string;
}

function teamsCacheKey(sport: SportType, leagueTag?: string): string {
  const tag = leagueTag?.toUpperCase();
  return tag ? `${sport}:${tag}` : sport;
}

const teamsCache: Partial<Record<string, SelectableTeam[]>> = {};

export function getCachedTeams(sport: SportType, leagueTag?: string): SelectableTeam[] | undefined {
  return teamsCache[teamsCacheKey(sport, leagueTag)];
}

export function prefetchTeams(
  sports: SportType[] = ['BASKETBALL', 'FOOTBALL', 'BASEBALL', 'HOCKEY'],
) {
  sports.forEach((sport, i) => {
    const delay = i * 400;
    const run = () => fetchTeams(sport).catch((err) => console.warn(`${sport} teams prefetch error:`, err));
    if (delay === 0) run();
    else setTimeout(run, delay);
  });
}

export function prefetchTeamsSecondary(
  sports: SportType[] = ['SOCCER', 'GOLF', 'TENNIS', 'FIGHTS'],
) {
  sports.forEach((sport, i) => {
    setTimeout(
      () => fetchTeams(sport).catch((err) => console.warn(`${sport} teams prefetch error:`, err)),
      3000 + i * 500,
    );
  });
}

function mapStatRow(labels: string[], values: string[]): StatItem[] {
  return labels.map((label, i) => ({
    label,
    value: values[i] ?? '-',
  }));
}

function pickHeroStats(stats: StatItem[], sport: SportType): StatItem[] {
  const profile = getSportProfile(sport);
  const picked = profile.heroStatLabels
    .map((label) => stats.find((s) => s.label === label))
    .filter((s): s is StatItem => Boolean(s));
  return picked.length > 0 ? picked : stats.slice(0, 6);
}

function parseSeasonHistory(data: any, teams: Record<string, any>): PlayerSeasonRow[] {
  const averages = data?.categories?.find((c: any) => c.name === 'averages');
  if (!averages?.statistics?.length) return [];

  const labelIndex = (label: string) => averages.labels.indexOf(label);

  const idx = {
    gp: labelIndex('GP'),
    min: labelIndex('MIN'),
    pts: labelIndex('PTS'),
    reb: labelIndex('REB'),
    ast: labelIndex('AST'),
    stl: labelIndex('STL'),
    blk: labelIndex('BLK'),
    fgPct: labelIndex('FG%'),
    fg3Pct: labelIndex('3P%'),
    ftPct: labelIndex('FT%'),
    to: labelIndex('TO'),
  };

  return [...averages.statistics]
    .reverse()
    .map((entry: any) => {
      const stats = entry.stats ?? [];
      const team = teams[entry.teamSlug];
      return {
        season: entry.season?.displayName ?? String(entry.season?.year ?? ''),
        team: team?.abbreviation,
        gp: stats[idx.gp] ?? '-',
        min: stats[idx.min] ?? '-',
        pts: stats[idx.pts] ?? '-',
        reb: stats[idx.reb] ?? '-',
        ast: stats[idx.ast] ?? '-',
        stl: stats[idx.stl] ?? '-',
        blk: stats[idx.blk] ?? '-',
        fgPct: stats[idx.fgPct] ?? '-',
        fg3Pct: stats[idx.fg3Pct] ?? '-',
        ftPct: stats[idx.ftPct] ?? '-',
        to: stats[idx.to] ?? '-',
      };
    });
}

function parseGameLog(overview: any): PlayerGameLogRow[] {
  const gameLog = overview?.gameLog;
  if (!gameLog?.statistics?.[0]) return [];

  const totals = gameLog.statistics[0];
  const labels = totals.labels ?? [];
  const events = totals.events ?? [];
  const eventMap = gameLog.events ?? {};

  const idx = {
    min: labels.indexOf('MIN'),
    pts: labels.indexOf('PTS'),
    reb: labels.indexOf('REB'),
    ast: labels.indexOf('AST'),
    stl: labels.indexOf('STL'),
    blk: labels.indexOf('BLK'),
  };

  return events.slice(0, 8).map((entry: any) => {
    const stats = entry.stats ?? [];
    const meta = eventMap[entry.eventId] ?? {};
    const opponent = meta.opponent?.abbreviation ?? meta.opponent?.displayName ?? 'OPP';
    const date = meta.gameDate
      ? new Date(meta.gameDate).toLocaleDateString([], { month: 'short', day: 'numeric' })
      : '-';
    const scoreText = coerceDisplayString(meta.score, '-');
    const result = meta.gameResult && scoreText !== '-' ? `${meta.gameResult} ${scoreText}` : scoreText;

    return {
      date,
      matchup: `${meta.atVs ?? ''} ${opponent}`.trim(),
      result,
      min: stats[idx.min] ?? '-',
      pts: stats[idx.pts] ?? '-',
      reb: stats[idx.reb] ?? '-',
      ast: stats[idx.ast] ?? '-',
      stl: stats[idx.stl] ?? '-',
      blk: stats[idx.blk] ?? '-',
    };
  });
}

export async function fetchPlayerDetails(
  player: Player,
  sport: SportType
): Promise<PlayerDetails> {
  if (isEngineSport(sport)) {
    const { data } = await getEngine(sport as EngineSport).getPlayerDetails(player);
    return data;
  }

  const profile = getSportProfile(sport);
  const sportPath = profile.athletePath;
  const fallback: PlayerDetails = {
    id: player.id,
    name: player.name,
    team: player.team,
    position: player.position,
    number: player.number,
    height: player.height,
    weight: player.weight,
    headshot: player.headshot || player.headshotUrl,
    heroStats: pickHeroStats(player.stats, sport),
    seasonSplits: player.stats.length
      ? [{ name: 'Season Leaders', stats: player.stats }]
      : [],
    seasonHistory: [],
    recentGames: [],
    awards: [],
  };

  if (!sportPath) return fallback;

  try {
    const base = resolveProxyUrl(`/api/espn/apis/common/v3/sports/${sportPath}/athletes/${player.id}`);
    const [bioRes, overviewRes, statsRes] = await Promise.all([
      fetch(base),
      fetch(`${base}/overview`),
      fetch(`${base}/stats`),
    ]);

    const bio = bioRes.ok ? await bioRes.json() : null;
    const overview = overviewRes.ok ? await overviewRes.json() : null;
    const statsData = statsRes.ok ? await statsRes.json() : null;

    const athlete = bio?.athlete;
    const mainStats = overview?.statistics;
    const splitBlocks: PlayerStatSplit[] = [];

    if (mainStats?.labels && mainStats?.splits?.length) {
      mainStats.splits.forEach((split: any) => {
        if (!split.stats?.length) return;
        splitBlocks.push({
          name: split.displayName,
          stats: mapStatRow(mainStats.labels, split.stats),
        });
      });
    }

    const nextGameSplits = overview?.nextGame?.statistics?.splits;
    if (nextGameSplits?.length && overview?.nextGame?.statistics?.labels) {
      nextGameSplits.forEach((split: any) => {
        if (!split.stats?.length) return;
        splitBlocks.push({
          name: split.displayName,
          stats: mapStatRow(overview.nextGame.statistics.labels, split.stats),
        });
      });
    }

    const regularSeason = profile.seasonSplitName
      ? splitBlocks.find((s) => s.name === profile.seasonSplitName)
      : splitBlocks[0];
    const heroStats = regularSeason
      ? pickHeroStats(regularSeason.stats, sport)
      : pickHeroStats(splitBlocks[0]?.stats ?? player.stats, sport);

    const awards: PlayerAward[] = (overview?.awards ?? []).map((award: any) => ({
      name: award.name,
      count: award.displayCount ?? '1x',
      seasons: award.seasons ?? [],
    }));

    return {
      id: player.id,
      name: athlete?.displayName ?? player.name,
      team: player.team,
      position: athlete?.position?.abbreviation ?? player.position,
      number: athlete?.jersey ?? player.number,
      height: athlete?.displayHeight ?? player.height,
      weight: athlete?.displayWeight ?? player.weight,
      headshot: athlete?.headshot?.href ?? athlete?.headshot ?? player.headshot ?? player.headshotUrl,
      debutYear: athlete?.debutYear,
      teamAccent: athlete?.team
        ? getTeamAccent({
            color: athlete.team.color ? `#${athlete.team.color}` : undefined,
            alternateColor: athlete.team.alternateColor ? `#${athlete.team.alternateColor}` : undefined,
          })
        : undefined,
      heroStats,
      seasonSplits: splitBlocks,
      seasonHistory: parseSeasonHistory(statsData, statsData?.teams ?? {}),
      recentGames: parseGameLog(overview),
      awards,
    };
  } catch (err) {
    console.error('Player details error:', err);
    return fallback;
  }
}

export const fetchTeams = async (
  sport: SportType,
  leagueTag?: string,
): Promise<SelectableTeam[]> => {
  const cacheKey = teamsCacheKey(sport, leagueTag);
  if (teamsCache[cacheKey]) return teamsCache[cacheKey];

  const sessionKey = `teams:${cacheKey}`;
  const cached = sessionGet<SelectableTeam[]>(sessionKey, CACHE_PROFILES.static.staleMs);
  if (cached?.length) {
    teamsCache[cacheKey] = cached;
    return cached;
  }

  const cdnKey = APP_SPORT_TO_CDN[sport];
  const subLeague = leagueTag?.toUpperCase();
  const teamsFromCdn = await loadCdnTeamsForSport(sport, subLeague);
  if (teamsFromCdn.length) {
    const parsed = teamsFromCdn
      .map((t) => ({
        id: String(t.espnId ?? t.id ?? t.abbr),
        espnId: t.espnId ? String(t.espnId) : undefined,
        sport,
        name: t.name,
        abbr: t.abbr,
        logo: t.logo,
        color: getTeamAccent({
          color: t.color,
          alternateColor: t.alternateColor,
        }),
        note: t.note,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    teamsCache[cacheKey] = parsed;
    sessionSet(sessionKey, parsed);
    return parsed;
  }

  if (sport === 'BASKETBALL' && subLeague === 'WNBA') {
    try {
      const raw = await espnWnbaTeams();
      const entries = raw?.sports?.[0]?.leagues?.[0]?.teams ?? [];
      const parsed: SelectableTeam[] = entries.map((entry: { team?: Record<string, unknown> }) => {
        const team = entry.team ?? {};
        const logos = (team.logos as Array<{ href?: string; rel?: string[] }>) ?? [];
        const logo =
          logos.find((l) => l.rel?.includes('default'))?.href
          ?? logos[0]?.href
          ?? '';
        return {
          id: String(team.id ?? team.abbreviation ?? ''),
          espnId: team.id != null ? String(team.id) : undefined,
          sport,
          name: coerceDisplayString(team.displayName ?? team.name, String(team.abbreviation ?? '')),
          abbr: coerceDisplayString(team.abbreviation, '—'),
          logo,
          color: getTeamAccent({
            color: team.color ? `#${team.color}` : undefined,
            alternateColor: team.alternateColor ? `#${team.alternateColor}` : undefined,
          }),
        };
      }).sort((a: SelectableTeam, b: SelectableTeam) => a.name.localeCompare(b.name));
      if (parsed.length) {
        teamsCache[cacheKey] = parsed;
        sessionSet(sessionKey, parsed);
        return parsed;
      }
    } catch (err) {
      console.error('WNBA teams error:', err);
    }
  }

  if (cdnKey && !subLeague) {
    const teams = await loadCdnTeamsForSport(sport);
    if (teams.length) {
      const parsed = teams
        .map((t) => ({
          id: String(t.espnId ?? t.id ?? t.abbr),
          espnId: t.espnId ? String(t.espnId) : undefined,
          sport,
          name: t.name,
          abbr: t.abbr,
          logo: t.logo,
          color: getTeamAccent({
            color: t.color,
            alternateColor: t.alternateColor,
          }),
          note: t.note,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      teamsCache[cacheKey] = parsed;
      sessionSet(sessionKey, parsed);
      return parsed;
    }
  }

  if (isEngineSport(sport) && !subLeague) {
    try {
      const { data } = await getEngine(sport as EngineSport).getTeams();
      const parsed: SelectableTeam[] = data.map((t: ResolvedTeam) => ({
        id: String(t.espnId ?? t.id ?? t.abbr),
        espnId: t.espnId ? String(t.espnId) : undefined,
        sport,
        name: t.name,
        abbr: t.abbr,
        logo: t.logo,
        color: getTeamAccent({
          color: t.color,
          alternateColor: t.alternateColor,
        }),
        note: t.note,
      })).sort((a, b) => a.name.localeCompare(b.name));
      teamsCache[cacheKey] = parsed;
      if (parsed.length) sessionSet(sessionKey, parsed);
      return parsed;
    } catch (err) {
      console.error(`${sport} teams error:`, err);
      return [];
    }
  }

  return [];
};

export function sportHasFeature(
  sport: SportType,
  feature: 'standings' | 'roster' | 'schedule' | 'playerProfile',
): boolean {
  if (feature === 'playerProfile') {
    return getSportProfile(sport).supportsPlayerProfile;
  }
  if (!isEngineSport(sport)) return false;
  return getSportCapabilities(sport).features[feature];
}

export function getLeagueContext(sport: SportType): LeagueContext | null {
  if (!isEngineSport(sport)) return null;
  return getEngine(sport).getLeagueContext();
}

export function getFeaturedGame(sport: SportType, games: Game[]): Game | undefined {
  if (!isEngineSport(sport)) return undefined;
  return getEngine(sport).getFeaturedGame?.(games);
}

export async function fetchStandings(sport: SportType): Promise<StandingsGroup[]> {
  if (!isEngineSport(sport)) return [];

  const sessionKey = `standings:${sport}`;
  const cached = sessionGet<StandingsGroup[]>(sessionKey, CACHE_PROFILES.season.staleMs);
  if (cached?.length) return cached;

  try {
    const { data } = await getEngine(sport).getStandings();
    if (data.length) sessionSet(sessionKey, data);
    return data;
  } catch (err) {
    console.error(`${sport} standings error:`, err);
    return cached ?? [];
  }
}

export async function fetchTeamRoster(
  sport: SportType,
  teamId: string,
  options?: TeamFetchOptions,
): Promise<Player[]> {
  if (!isEngineSport(sport)) return [];

  const leagueTag = options?.leagueTag?.toUpperCase();
  const sessionKey = `roster:${sport}:${leagueTag ?? 'default'}:${teamId}`;
  const cached = sessionGet<Player[]>(sessionKey, CACHE_PROFILES.static.staleMs);
  if (cached?.length) return cached;

  if (sport === 'BASKETBALL' && leagueTag === 'WNBA') {
    try {
      const raw = await espnWnbaTeamRoster(teamId);
      if (!raw) return cached ?? [];
      const roster = parseEspnRoster(raw).map((p) => ({
        ...p,
        team: '',
        stats: [] as StatItem[],
      }));
      if (roster.length) sessionSet(sessionKey, roster);
      return roster;
    } catch (err) {
      console.error('WNBA roster error:', err);
      return cached ?? [];
    }
  }

  try {
    const { data } = await getEngine(sport).getTeamRoster(teamId);
    if (data.length) sessionSet(sessionKey, data);
    return data;
  } catch (err) {
    console.error(`${sport} roster error:`, err);
    return cached ?? [];
  }
}

export async function fetchTeamSchedule(
  sport: SportType,
  teamId: string,
  options?: TeamFetchOptions,
): Promise<Game[]> {
  if (!isEngineSport(sport)) return [];

  const leagueTag = options?.leagueTag?.toUpperCase();
  if (sport === 'BASKETBALL' && leagueTag === 'WNBA') {
    try {
      const raw = await espnWnbaTeamSchedule(teamId);
      const events = getEspnEvents(raw);
      const parsed = parseEventsForSport(events, 'BASKETBALL', { telemetrySport: 'WNBA' })
        .map((g) => ({ ...g, sport: 'WNBA' as const }));
      return filterRecentGames(dedupeGamesById(parsed));
    } catch (err) {
      console.error('WNBA schedule error:', err);
      return [];
    }
  }

  try {
    const { data } = await getEngine(sport).getTeamSchedule(teamId);
    return filterRecentGames(dedupeGamesById(data));
  } catch (err) {
    console.error(`${sport} schedule error:`, err);
    return [];
  }
}

export async function searchPlayersForSport(sport: SportType, query: string): Promise<Player[]> {
  if (!isEngineSport(sport) || !query.trim()) return [];
  try {
    const { data } = await getEngine(sport).searchPlayers(query.trim());
    return data;
  } catch (err) {
    console.error(`${sport} player search error:`, err);
    return [];
  }
}

export { searchCatalog, type SearchResultItem, type SearchResultType } from './search';

export async function fetchWnbaLeagueContext(): Promise<LeagueContext | null> {
  if (!isEngineSport('BASKETBALL')) return null;
  try {
    return (await getEngine('BASKETBALL').getWnbaLeagueContext?.()) ?? null;
  } catch (err) {
    console.warn('WNBA league context error:', err);
    return null;
  }
}

export async function fetchNflStatLeaders(): Promise<NflStatCategory[]> {
  const sessionKey = 'nfl:stat-leaders';
  const cached = sessionGet<NflStatCategory[]>(sessionKey, CACHE_PROFILES.season.staleMs);
  if (cached?.length) return cached;

  try {
    const raw = await espnNflLeaders();
    const parsed = parseEspnNflStatLeaders(raw);
    if (parsed?.length) {
      sessionSet(sessionKey, parsed);
      return parsed;
    }
  } catch (err) {
    console.warn('NFL stat leaders error:', err);
  }

  return cached ?? [];
}

export async function fetchNbaStatLeaders(): Promise<StatLeaderCategory[]> {
  const sessionKey = 'nba:stat-leaders';
  const cached = sessionGet<StatLeaderCategory[]>(sessionKey, CACHE_PROFILES.season.staleMs);
  if (cached?.length) return cached;

  try {
    const raw = await espnNbaLeaders();
    const parsed = parseEspnNbaStatLeaders(raw);
    if (parsed?.length) {
      sessionSet(sessionKey, parsed);
      return parsed;
    }
  } catch (err) {
    console.warn('NBA stat leaders error:', err);
  }

  return cached ?? [];
}

export async function fetchMlbStatLeaders(): Promise<StatLeaderCategory[]> {
  const sessionKey = 'mlb:stat-leaders';
  const cached = sessionGet<StatLeaderCategory[]>(sessionKey, CACHE_PROFILES.season.staleMs);
  if (cached?.length) return cached;

  try {
    const raw = await espnMlbLeaders();
    const parsed = parseEspnMlbStatLeaders(raw);
    if (parsed?.length) {
      sessionSet(sessionKey, parsed);
      return parsed;
    }
  } catch (err) {
    console.warn('MLB stat leaders error:', err);
  }

  return cached ?? [];
}

export async function fetchMlsStatLeaders(): Promise<StatLeaderCategory[]> {
  const sessionKey = 'mls:stat-leaders';
  const cached = sessionGet<StatLeaderCategory[]>(sessionKey, CACHE_PROFILES.season.staleMs);
  if (cached?.length) return cached;

  try {
    const raw = await espnMlsLeaders();
    const parsed = parseEspnMlsStatLeaders(raw);
    if (parsed?.length) {
      sessionSet(sessionKey, parsed);
      return parsed;
    }
  } catch (err) {
    console.warn('MLS stat leaders error:', err);
  }

  return cached ?? [];
}

export async function fetchGolfStatLeaders(): Promise<GolfStatLeaderCategory[]> {
  const sessionKey = 'golf:stat-leaders';
  const cached = sessionGet<GolfStatLeaderCategory[]>(sessionKey, CACHE_PROFILES.season.staleMs);
  if (cached?.length) return cached;

  try {
    const raw = await espnGolfLeaders('PGA');
    const parsed = parseEspnGolfStatLeaders(raw);
    if (parsed?.length) {
      sessionSet(sessionKey, parsed);
      return parsed;
    }
  } catch (err) {
    console.warn('Golf stat leaders error:', err);
  }

  return cached ?? [];
}

export async function fetchNhlStatLeaders(): Promise<StatLeaderCategory[]> {
  const sessionKey = 'nhl:stat-leaders';
  const cached = sessionGet<StatLeaderCategory[]>(sessionKey, CACHE_PROFILES.season.staleMs);
  if (cached?.length) return cached;

  try {
    const raw = await espnNhlLeaders();
    const parsed = parseEspnNhlStatLeaders(raw);
    if (parsed?.length) {
      sessionSet(sessionKey, parsed);
      return parsed;
    }
  } catch (err) {
    console.warn('NHL stat leaders error:', err);
  }

  return cached ?? [];
}

export interface NflSeasonMeta {
  year: number;
  seasonType: number;
  currentWeek: number;
  regularSeasonWeeks: number;
}

export async function fetchNflSeasonMeta(): Promise<NflSeasonMeta | null> {
  const sessionKey = 'nfl:season-meta';
  const cached = sessionGet<NflSeasonMeta>(sessionKey, CACHE_PROFILES.season.staleMs);
  if (cached?.year) return cached;

  try {
    const raw = await espnNflScoreboard();
    if (!raw?.season?.year) return cached ?? null;
    const meta: NflSeasonMeta = {
      year: raw.season.year,
      seasonType: raw.season.type ?? 2,
      currentWeek: raw.week?.number ?? 1,
      regularSeasonWeeks: 18,
    };
    sessionSet(sessionKey, meta);
    return meta;
  } catch (err) {
    console.warn('NFL season meta error:', err);
    return cached ?? null;
  }
}

export async function fetchNflWeekSchedule(
  week: number,
  year?: number,
  seasonType = 2,
): Promise<Game[]> {
  const sessionKey = `nfl:schedule:${year ?? 'current'}:${seasonType}:${week}`;
  const cached = sessionGet<Game[]>(sessionKey, CACHE_PROFILES.season.staleMs);
  if (cached?.length) return cached;

  try {
    const raw = await espnNflWeekScoreboard(week, year, seasonType);
    const events = getEspnEvents(raw);
    const parsed = filterRecentGames(dedupeGamesById(parseEventsForSport(events, 'FOOTBALL')));
    if (parsed.length) {
      sessionSet(sessionKey, parsed);
      return parsed;
    }
  } catch (err) {
    console.warn(`NFL week ${week} schedule error:`, err);
  }

  return cached ?? [];
}

function formatEspnDateAnchor(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/** First-of-month anchors for dated ESPN scoreboard fetches. */
export function buildSeasonMonthAnchors(pastMonths = 3, futureMonths = 9): string[] {
  const anchors: string[] = [];
  const now = new Date();
  for (let offset = -pastMonths; offset <= futureMonths; offset += 1) {
    const month = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    anchors.push(formatEspnDateAnchor(month));
  }
  return anchors;
}

export async function fetchGolfSeasonEvents(): Promise<Game[]> {
  const sessionKey = 'golf:season-events';
  const cached = sessionGet<Game[]>(sessionKey, CACHE_PROFILES.season.staleMs);
  if (cached?.length) return cached;

  try {
    const anchors = buildSeasonMonthAnchors(3, 9);
    const games: Game[] = [];
    for (const dates of anchors) {
      const [pga, lpga] = await Promise.all([
        espnPgaScoreboard(dates),
        espnLpgaScoreboard(dates),
      ]);
      if (!pga?.events?.length && !lpga?.events?.length) continue;
      games.push(...parseGolfScoreboardEvents({
        events: pga?.events ?? [],
        lpgaEvents: lpga?.events ?? [],
      }));
    }
    const parsed = dedupeGamesById(games);
    if (parsed.length) {
      sessionSet(sessionKey, parsed);
      return parsed;
    }
  } catch (err) {
    console.warn('Golf season events error:', err);
  }

  return cached ?? [];
}

export async function fetchTennisSeasonEvents(): Promise<Game[]> {
  const sessionKey = 'tennis:season-events';
  const cached = sessionGet<Game[]>(sessionKey, CACHE_PROFILES.season.staleMs);
  if (cached?.length) return cached;

  try {
    const anchors = buildSeasonMonthAnchors(3, 9);
    const games: Game[] = [];
    for (const dates of anchors) {
      const [atp, wta] = await Promise.all([
        espnAtpScoreboard(dates),
        espnWtaScoreboard(dates),
      ]);
      if (!atp?.events?.length && !wta?.events?.length) continue;
      games.push(...parseTennisScoreboardEvents({
        events: atp?.events ?? [],
        atpEvents: atp?.events ?? [],
        wtaEvents: wta?.events ?? [],
      }));
    }
    const parsed = dedupeGamesById(games);
    if (parsed.length) {
      sessionSet(sessionKey, parsed);
      return parsed;
    }
  } catch (err) {
    console.warn('Tennis season events error:', err);
  }

  return cached ?? [];
}

export async function fetchNflDraft(): Promise<NflDraftBoard | null> {
  const sessionKey = 'nfl:draft';
  const cached = sessionGet<NflDraftBoard>(sessionKey, CACHE_PROFILES.season.staleMs);
  if (cached?.picks?.length) return cached;

  try {
    const raw = await espnNflDraft();
    const parsed = parseEspnNflDraft(raw);
    if (parsed?.picks?.length) {
      sessionSet(sessionKey, parsed);
      return parsed;
    }
  } catch (err) {
    console.warn('NFL draft error:', err);
  }

  return cached ?? null;
}

export type { NflDraftBoard, NflDraftPick, NflStatCategory, NflStatLeaderEntry } from '../engine/sources/espnNflSource';
export type { StatLeaderCategory, StatLeaderEntry } from '../engine/sources/espnStatLeaders';
export type { GolfStatLeaderCategory, GolfStatLeaderEntry } from '../engine/sources/espnGolfSource';
