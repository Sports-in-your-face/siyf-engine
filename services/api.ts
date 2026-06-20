import { getSportProfile, getPlayerProfileForLeague } from '../config/sportProfiles';
import { engineLogError, engineLogWarn } from '../config/engineLog';
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
import { coerceDisplayString } from '../utils/coerce';
import { getTeamAccent } from '../utils/teamColors';
import { filterRecentGames } from '../utils/gameFilters';
import { dedupeGamesById } from '../engine/core/mergeGames';
import { getEngine, type EngineSport, type ResolvedTeam, type StandingsGroup } from '../engine';
import { getSportCapabilities } from '../engine/core/sportCapabilities';
import { isEngineSport } from '../engine/engineSports';
import type { LeagueContext } from '../types';

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

export async function fetchGames(sport: SportType): Promise<Game[]> {
  if (isEngineSport(sport)) {
    try {
      const { data } = await getEngine(sport).getScoreboard();
      return filterRecentGames(dedupeGamesById(data));
    } catch (err) {
      engineLogError(`${sport} engine error:`, err);
      return [];
    }
  }

  try {
    const url = resolveProxyUrl(SPORT_ENDPOINTS[sport]);
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();
    const cdnKey = APP_SPORT_TO_CDN[sport];
    if (cdnKey) await ensureTeamRegistry(cdnKey);
    const events = getEspnEvents(data);
    const parsed = parseEventsForSport(events, sport);
    const games = filterRecentGames(
      dedupeGamesById(cdnKey ? enrichGamesTeamsFromCdn(sport, parsed) : parsed),
    );
    return games;
  } catch (err) {
    engineLogError('API Error:', err);
    return [];
  }
}

export async function fetchGameDetail(game: Game, sport: SportType): Promise<Game> {
  if (isEngineSport(sport)) {
    try {
      const { data } = await getEngine(sport).getGameDetail(game);
      return data;
    } catch (err) {
      engineLogWarn(`${sport} game detail error (${game.id}):`, err);
      return game;
    }
  }
  return game;
}

export interface SelectableTeam {
  id: string;
  sport: SportType;
  name: string;
  abbr: string;
  logo?: string;
  /** ESPN soccer league slug for bookmark filtering and roster routing. */
  leagueSlug?: string;
}

const teamsCache: Partial<Record<SportType, SelectableTeam[]>> = {};

export function getCachedTeams(sport: SportType): SelectableTeam[] | undefined {
  return teamsCache[sport];
}

export function prefetchTeams(sports: SportType[] = ['BASKETBALL', 'FOOTBALL', 'SOCCER', 'BASEBALL', 'GOLF', 'TENNIS', 'HOCKEY', 'FIGHTS']) {
  const batch = sports.slice(0, 5);
  void Promise.all(
    batch.map((sport) =>
      fetchTeams(sport).catch((err) => engineLogWarn(`${sport} teams prefetch error:`, err)),
    ),
  );
  for (const sport of sports.slice(5)) {
    fetchTeams(sport).catch((err) => engineLogWarn(`${sport} teams prefetch error:`, err));
  }
}

function mapStatRow(labels: string[], values: string[]): StatItem[] {
  return labels.map((label, i) => ({
    label,
    value: values[i] ?? '-',
  }));
}

function pickHeroStats(stats: StatItem[], sport: SportType, leagueSport?: string): StatItem[] {
  const profile = getPlayerProfileForLeague(sport, leagueSport);
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

  const profile = getPlayerProfileForLeague(sport, player.leagueSport);
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
    heroStats: pickHeroStats(player.stats, sport, player.leagueSport),
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
        ?? splitBlocks.find((s) => /regular/i.test(s.name))
      : splitBlocks[0];
    const heroStats = regularSeason
      ? pickHeroStats(regularSeason.stats, sport, player.leagueSport)
      : pickHeroStats(splitBlocks[0]?.stats ?? player.stats, sport, player.leagueSport);

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
    engineLogError('Player details error:', err);
    return fallback;
  }
}

export const fetchTeams = async (sport: SportType): Promise<SelectableTeam[]> => {
  if (teamsCache[sport]) return teamsCache[sport];

  const cdnKey = APP_SPORT_TO_CDN[sport];
  if (cdnKey) {
    const teams = await loadCdnTeamsForSport(sport);
    if (teams.length) {
      const parsed = teams
        .map((t) => ({
          id: t.id,
          sport,
          name: t.name,
          abbr: t.abbr,
          logo: t.logo,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      teamsCache[sport] = parsed;
      return parsed;
    }
  }

  if (isEngineSport(sport)) {
    try {
      const { data } = await getEngine(sport as EngineSport).getTeams();
      const parsed: SelectableTeam[] = data.map((t: ResolvedTeam) => ({
        id: t.id,
        sport,
        name: t.name,
        abbr: t.abbr,
        logo: t.logo,
        leagueSlug: t.leagueSlug,
      })).sort((a, b) => a.name.localeCompare(b.name));
      teamsCache[sport] = parsed;
      return parsed;
    } catch (err) {
      engineLogError(`${sport} teams error:`, err);
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
  try {
    const { data } = await getEngine(sport).getStandings();
    return data;
  } catch (err) {
    engineLogError(`${sport} standings error:`, err);
    return [];
  }
}

export async function fetchTeamRoster(sport: SportType, teamId: string): Promise<Player[]> {
  if (!isEngineSport(sport)) return [];
  try {
    const { data } = await getEngine(sport).getTeamRoster(teamId);
    return data;
  } catch (err) {
    engineLogError(`${sport} roster error:`, err);
    return [];
  }
}

export async function enrichTeamRosterStats(sport: SportType, roster: Player[]): Promise<Player[]> {
  if (!isEngineSport(sport) || !roster.length) return roster;
  try {
    const { data } = await getEngine(sport as EngineSport).enrichTeamRosterStats(roster);
    return data;
  } catch (err) {
    engineLogWarn(`${sport} roster stats enrichment error:`, err);
    return roster;
  }
}

export async function fetchTeamSchedule(sport: SportType, teamId: string): Promise<Game[]> {
  if (!isEngineSport(sport)) return [];
  try {
    const { data } = await getEngine(sport).getTeamSchedule(teamId);
    return filterRecentGames(dedupeGamesById(data));
  } catch (err) {
    engineLogError(`${sport} schedule error:`, err);
    return [];
  }
}

export async function searchPlayersForSport(sport: SportType, query: string): Promise<Player[]> {
  if (!isEngineSport(sport) || !query.trim()) return [];
  try {
    const { data } = await getEngine(sport).searchPlayers(query.trim());
    return data;
  } catch (err) {
    engineLogError(`${sport} player search error:`, err);
    return [];
  }
}

export async function fetchWnbaLeagueContext(): Promise<LeagueContext | null> {
  if (!isEngineSport('BASKETBALL')) return null;
  try {
    return (await getEngine('BASKETBALL').getWnbaLeagueContext?.()) ?? null;
  } catch (err) {
    engineLogWarn('WNBA league context error:', err);
    return null;
  }
}
