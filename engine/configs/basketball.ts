import {
  mergeContext,
  parseGameContextFromSummary,
  parseLeagueContext,
  refineLeaguePhase,
  sortGamesByContext,
} from '../../services/parsers/parseBasketballContext';
import { cacheKey, cacheSet } from '../core/cache';
import {
  BASKETBALL_LABEL_INDEX,
  createBuildEspnPlayerDetails,
  createEngineLog,
  createParseGameLog,
  createParseSeasonHistory,
  createSafeFetch,
} from '../core/engineUtils';
import { mergeStandingsGroups } from '../core/mergePayload';
import { tryScoreboardStep } from '../core/scoreboardExtras';
import { createHistoricalAfterPlayerDetails } from '../sources/historicalSources';
import { fetchDraftKingsProps, fetchSleeperPlayerDetail } from '../sources/fantasySources';
import { fetchBartTorvikStandings } from '../sources/analyticsSources';
import {
  espnAthlete,
  espnWnbaAthlete,
  espnScoreboard,
  espnSearchAthletes,
  espnStandings,
  espnSummaryForGame,
  espnTeamRoster,
  espnTeamSchedule,
  buildEspnPreGameBoxScore,
  parseEspnBoxScore,
  parseEspnGameMeta,
  parseEspnPlays,
  parseEspnRoster,
  parseEspnTeamStats,
  parseEspnTopPerformers,
  enrichEspnNbaRosterSeasonStats,
} from '../sources/espnSource';
import { enrichRosterWithGLeague } from '../sources/gleagueSource';
import { enrichGamesWithOdds, fetchFanDuelTopPerformers } from '../sources/oddsSources';
import { fetchSupplementalScoreboards, fetchWnbaLeagueContext } from '../sources/openDataFeeds';
import { dedupeGamesById } from '../core/mergeGames';
import {
  espnPostseasonScoreboard,
  POSTSEASON_SCOREBOARD_KEY,
  rssCrossCheckSeriesHint,
} from '../sources/postseasonSource';
import {
  enrichGamesFromRss,
  enrichRosterWithInjuries,
  enrichTeamsWithNotes,
  fetchPlayerRumors,
} from '../sources/rssEnricher';
import { enrichTeam, getAllTeams, resolveTeamLogo } from '../sources/teamRegistry';
import { fetchWikipediaBio } from '../sources/wikiSources';
import { isScoreboardNoiseText, contextLabelFromHeadline } from '../../utils/scoreboardNoise';
import { getPlayerProfileForLeague } from '../../config/sportProfiles';
import type { SportEngineConfig } from '../sportConfig';

const log = createEngineLog('basketball-engine');
const safeFetch = createSafeFetch(log);
const parseSeasonHistory = createParseSeasonHistory(BASKETBALL_LABEL_INDEX, log, true);
const parseGameLog = createParseGameLog(BASKETBALL_LABEL_INDEX, log, true);
const buildEspnPlayer = createBuildEspnPlayerDetails(
  ['PTS', 'PPG', 'REB', 'RPG', 'AST', 'APG', 'FG%', '3P%', 'MIN', 'STL', 'BLK'],
  parseSeasonHistory,
  parseGameLog,
  log,
  true,
);

export const basketballConfig: SportEngineConfig = {
  id: 'basketball',
  sport: 'BASKETBALL',
  cacheSourcePrefix: 'espn',
  cdnTeamKey: 'nba',
  scoreboardCacheKey: cacheKey('engine', 'scoreboard', 'today'),
  teamsCacheKey: cacheKey('teams', 'nba'),
  detailCacheKey: (game) => cacheKey('detail', game.id),
  minTeamCount: 30,
  notesSourceId: 'hoopsrumors',
  teams: { enrichTeam, resolveLogo: resolveTeamLogo, getAllTeams },
  context: {
    parseLeagueContext,
    refineLeaguePhase,
    parseContextFromSummary: (s, a, h) => parseGameContextFromSummary(s, a, h),
    mergeContext,
    sortGamesByContext,
  },
  espn: {
    scoreboard: espnScoreboard,
    athlete: espnAthlete,
    searchAthletes: espnSearchAthletes,
    standings: espnStandings,
    teamRoster: espnTeamRoster,
    teamSchedule: espnTeamSchedule,
    detail: {
      fetchSummary: (game) => espnSummaryForGame(game),
      parseBoxScore: parseEspnBoxScore,
      buildPreGameBoxScore: (summary, away, home, game) => buildEspnPreGameBoxScore(summary, away, home, game),
      parseTeamStats: parseEspnTeamStats,
      parsePlays: parseEspnPlays,
      parseGameMeta: parseEspnGameMeta,
      parseTopPerformers: parseEspnTopPerformers,
      parseRoster: parseEspnRoster,
    },
  },
  enrichment: {
    enrichGamesFromRss,
    enrichGamesWithOdds,
    enrichTeamsWithNotes,
    enrichRosterWithInjuries,
    fetchFanDuelTopPerformers,
  },
  buildPlayerDetails: (player, raw) =>
    buildEspnPlayer(player, raw, getPlayerProfileForLeague('BASKETBALL', player.leagueSport)),
  resolveAthlete: (player) =>
    player.leagueSport === 'WNBA' ? espnWnbaAthlete(player.id) : espnAthlete(player.id),
  playerDetailProviders: [
    { id: 'sleeper', fetch: (player) => fetchSleeperPlayerDetail(player) },
    { id: 'wikipedia', fetch: (player) => fetchWikipediaBio(player) },
    {
      id: 'hoopshype',
      fetch: async (player) => {
        const rumors = await fetchPlayerRumors(player);
        return rumors.length ? { rumors } : null;
      },
    },
    { id: 'draftkings', lastResort: true, fetch: (player) => fetchDraftKingsProps(player) },
  ],
  afterPlayerDetails: createHistoricalAfterPlayerDetails('BASKETBALL'),
  standingsProviders: [
    {
      id: 'espn',
      fetch: async () => {
        const res = await safeFetch('standings.espn', () => espnStandings());
        return res.success && res.data?.length ? res.data : null;
      },
    },
    { id: 'barttorvik', fetch: () => fetchBartTorvikStandings() },
  ],
  mergeStandingsExtra: mergeStandingsGroups,
  enrichRosterExtra: enrichRosterWithGLeague,
  rosterExtraSourceId: 'gleague',
  enrichTeamRosterStats: enrichEspnNbaRosterSeasonStats,
  searchWithWikidata: true,
  getFeaturedGame: (games) =>
    sortGamesByContext(games).find(
      (g) =>
        g.sport !== 'WNBA'
        && g.sport !== 'NCAA'
        && (g.context?.phase === 'finals' || (g.context?.phase === 'playoffs' && g.statusState === 'pre')),
    ),
  getWnbaLeagueContext: fetchWnbaLeagueContext,
  enrichMissingContext: async (games, isPostseason) => {
    if (!isPostseason) return games;
    return Promise.all(
      games.map(async (game) => {
        try {
          if (game.sport === 'WNBA' || game.sport === 'NCAA') return game;
          if (game.context?.headline) return game;
          if (game.context?.phase !== 'finals' && game.context?.phase !== 'playoffs') return game;

          const res = await safeFetch('enrichMissingContext', () =>
            rssCrossCheckSeriesHint(game.away.name, game.home.name),
          );
          const hint = res.success ? res.data : null;
          if (!hint?.headline || isScoreboardNoiseText(hint.headline)) return game;

          const badge = contextLabelFromHeadline(hint.headline);
          const ctx = mergeContext(game.context, {
            phase: game.context?.phase ?? 'finals',
            headline: hint.headline,
            ...(badge ? { badge } : {}),
            seriesSummary: hint.seriesSummary ?? game.context?.seriesSummary,
            priority: 1050,
          });
          return { ...game, context: ctx };
        } catch (err) {
          log('warn', 'enrichMissingContext', `RSS finals hint failed for ${game.id}`, err);
          return game;
        }
      }),
    );
  },
  loadScoreboardExtras: async ({ games, espnRaw, sources }) => {
    let nextGames = games;
    const nextSources = [...sources];
    let nextRaw = espnRaw;

    const supplemental = await tryScoreboardStep(
      'basketball',
      'supplemental scoreboards',
      fetchSupplementalScoreboards,
      { games: [], sources: [] },
    );
    if (supplemental.games.length) {
      nextGames = dedupeGamesById(nextGames.concat(supplemental.games));
      nextSources.push(...supplemental.sources);
    }

    const rawContext = await tryScoreboardStep(
      'basketball',
      'postseason scoreboard',
      espnPostseasonScoreboard,
      null,
    );
    if (rawContext) {
      nextRaw = nextRaw ?? rawContext;
      cacheSet(POSTSEASON_SCOREBOARD_KEY, rawContext, 30_000, 300_000);
    }

    return { games: nextGames, espnRaw: nextRaw, sources: nextSources };
  },
};
