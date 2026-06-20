import {
  mergeBaseballContext,
  parseBaseballContextFromSummary,
  parseBaseballLeagueContext,
  refineBaseballLeaguePhase,
  sortBaseballGamesByContext,
} from '../../services/parsers/parseBaseballContext';
import { guardedEspnTeamSummaryEventId } from '../core/espnSummaryGuard';
import { cacheKey } from '../core/cache';
import {
  BASEBALL_LABEL_INDEX,
  createBuildEspnPlayerDetails,
  createEngineLog,
  createParseGameLog,
  createParseSeasonHistory,
  createSafeFetch,
} from '../core/engineUtils';
import {
  espnMlbAthlete,
  espnMlbScoreboard,
  espnMlbSearchAthletes,
  espnMlbStandings,
  espnMlbSummary,
  espnMlbTeamRoster,
  espnMlbTeamSchedule,
  parseEspnMlbBoxScore,
  parseEspnMlbGameMeta,
  parseEspnMlbPlays,
  parseEspnMlbRoster,
  parseEspnMlbTeamStats,
  parseEspnMlbTopPerformers,
  buildEspnMlbPreGameBoxScore,
  enrichEspnMlbRosterSeasonStats,
} from '../sources/espnMlbSource';
import { enrichMlbGamesWithOdds, fetchMlbFanDuelTopPerformers } from '../sources/mlbOddsSources';
import {
  enrichMlbGamesFromRss,
  enrichMlbRosterWithInjuries,
  enrichMlbTeamsWithNotes,
  fetchMlbPlayerRumors,
  mlbRssCrossCheckPlayoffHint,
} from '../sources/mlbRssEnricher';
import { enrichMlbTeam, getAllMlbTeams, resolveMlbTeamLogo } from '../sources/teamRegistry';
import { getSportProfile } from '../../config/sportProfiles';
import { contextLabelFromHeadline, isScoreboardNoiseText } from '../../utils/scoreboardNoise';
import { createHistoricalAfterPlayerDetails } from '../sources/historicalSources';
import { fetchMlbPitchMetricsForGame } from '../sources/mlbStatsApiSource';
import type { SportEngineConfig } from '../sportConfig';

const log = createEngineLog('baseball-engine');
const safeFetch = createSafeFetch(log);
const parseSeasonHistory = createParseSeasonHistory(BASEBALL_LABEL_INDEX, log);
const parseGameLog = createParseGameLog(BASEBALL_LABEL_INDEX, log);
const buildEspnPlayer = createBuildEspnPlayerDetails(
  ['AVG', 'HR', 'RBI', 'R', 'H', 'SB', 'ERA', 'W', 'SO', 'SV', 'IP', 'OBP', 'SLG'],
  parseSeasonHistory,
  parseGameLog,
  log,
);

export const baseballConfig: SportEngineConfig = {
  id: 'baseball',
  sport: 'BASEBALL',
  cacheSourcePrefix: 'espn-mlb',
  cdnTeamKey: 'mlb',
  scoreboardCacheKey: cacheKey('baseball-engine', 'scoreboard', 'today'),
  teamsCacheKey: cacheKey('baseball-teams', 'mlb'),
  detailCacheKey: (game) => cacheKey('baseball-detail', game.id),
  minTeamCount: 30,
  notesSourceId: 'mlbtr',
  sportFilter: 'BASEBALL',
  teams: { enrichTeam: enrichMlbTeam, resolveLogo: resolveMlbTeamLogo, getAllTeams: getAllMlbTeams },
  context: {
    parseLeagueContext: parseBaseballLeagueContext,
    refineLeaguePhase: refineBaseballLeaguePhase,
    parseContextFromSummary: (s, a, h) => parseBaseballContextFromSummary(s, a, h),
    mergeContext: mergeBaseballContext,
    sortGamesByContext: sortBaseballGamesByContext,
  },
  espn: {
    scoreboard: espnMlbScoreboard,
    athlete: espnMlbAthlete,
    searchAthletes: espnMlbSearchAthletes,
    standings: espnMlbStandings,
    teamRoster: espnMlbTeamRoster,
    teamSchedule: espnMlbTeamSchedule,
    detail: {
      fetchSummary: (game) => {
        const eventId = guardedEspnTeamSummaryEventId(game);
        return eventId ? espnMlbSummary(eventId, game.statusState) : Promise.resolve(null);
      },
      buildPreGameBoxScore: buildEspnMlbPreGameBoxScore,
      parseBoxScore: parseEspnMlbBoxScore,
      parseTeamStats: parseEspnMlbTeamStats,
      parsePlays: parseEspnMlbPlays,
      parseGameMeta: parseEspnMlbGameMeta,
      parseTopPerformers: parseEspnMlbTopPerformers,
      parseRoster: parseEspnMlbRoster,
    },
  },
  enrichment: {
    enrichGamesFromRss: enrichMlbGamesFromRss,
    enrichGamesWithOdds: enrichMlbGamesWithOdds,
    enrichTeamsWithNotes: enrichMlbTeamsWithNotes,
    enrichRosterWithInjuries: enrichMlbRosterWithInjuries,
    fetchFanDuelTopPerformers: fetchMlbFanDuelTopPerformers,
  },
  buildPlayerDetails: (player, raw) => buildEspnPlayer(player, raw, getSportProfile('BASEBALL')),
  afterPlayerDetails: createHistoricalAfterPlayerDetails('BASEBALL'),
  enrichTeamRosterStats: enrichEspnMlbRosterSeasonStats,
  playerDetailProviders: [
    {
      id: 'mlbtr_rumors',
      fetch: async (player) => {
        const rumors = await fetchMlbPlayerRumors(player);
        return rumors.length ? { rumors } : null;
      },
    },
  ],
  enrichMissingContext: async (games, isPostseason) => {
    if (!isPostseason) return games;
    return Promise.all(
      games.map(async (game) => {
        try {
          if (game.sport && game.sport !== 'BASEBALL') return game;
          if (game.context?.headline) return game;
          if (game.context?.phase !== 'finals' && game.context?.phase !== 'playoffs') return game;

          const res = await safeFetch('enrichMissingContext', () =>
            mlbRssCrossCheckPlayoffHint(game.away.name, game.home.name),
          );
          const hint = res.success ? res.data : null;
          if (!hint?.headline || isScoreboardNoiseText(hint.headline)) return game;

          const badge = contextLabelFromHeadline(hint.headline);
          const ctx = mergeBaseballContext(game.context, {
            phase: game.context?.phase ?? 'playoffs',
            headline: hint.headline,
            ...(badge ? { badge } : {}),
            priority: 850,
          });
          return { ...game, context: ctx };
        } catch {
          return game;
        }
      }),
    );
  },
  enrichGameDetail: async (detail, summary) => {
    const pitches = await fetchMlbPitchMetricsForGame(detail, summary);
    return pitches.length ? { pitches } : {};
  },
};
