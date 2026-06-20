import {
  mergeGolfContext,
  parseGolfContextFromSummary,
  parseGolfLeagueContext,
  refineGolfLeaguePhase,
  sortGolfGamesByContext,
} from '../../services/parsers/parseGolfContext';
import { cacheKey } from '../core/cache';
import {
  createBuildEspnPlayerDetails,
  createEngineLog,
  createParseGameLog,
  createParseSeasonHistory,
  createSafeFetch,
  GOLF_LABEL_INDEX,
} from '../core/engineUtils';
import {
  enrichGolfGameDetail,
  espnGolfAthlete,
  espnGolfEventSummary,
  espnGolfMergedScoreboard,
  espnGolfMergedStandings,
  espnGolfSearchAthletes,
  parseEspnGolfGameMeta,
  parseEspnGolfRoster,
  parseEspnGolfTeamStats,
  parseEspnGolfTopPerformers,
  parseGolfScoreboardEvents,
} from '../sources/espnGolfSource';
import { noopTeams } from '../sources/individualSportStubs';
import { enrichGolfGamesFromRss, golfRssCrossCheckMajorHint } from '../sources/golfRssEnricher';
import { parseEspnIndividualStandings } from '../core/standingsUtils';
import { isScoreboardNoiseText, contextLabelFromHeadline } from '../../utils/scoreboardNoise';
import { getSportProfile } from '../../config/sportProfiles';
import { createHistoricalAfterPlayerDetails } from '../sources/historicalSources';
import type { SportEngineConfig } from '../sportConfig';

const log = createEngineLog('golf-engine');
const safeFetch = createSafeFetch(log);
const parseSeasonHistory = createParseSeasonHistory(GOLF_LABEL_INDEX, log);
const parseGameLog = createParseGameLog(GOLF_LABEL_INDEX, log);
const buildEspnPlayer = createBuildEspnPlayerDetails(
  ['POS', 'TOT', 'TO PAR', 'THRU', 'R1', 'R2', 'R3', 'R4'],
  parseSeasonHistory,
  parseGameLog,
  log,
);

export const golfConfig: SportEngineConfig = {
  id: 'golf',
  sport: 'GOLF',
  cacheSourcePrefix: 'espn-golf',
  cdnTeamKey: 'nba',
  scoreboardCacheKey: cacheKey('golf-engine', 'scoreboard', 'today'),
  teamsCacheKey: cacheKey('golf-teams', 'pga'),
  detailCacheKey: (game) => cacheKey('golf-detail', game.id),
  minTeamCount: 0,
  notesSourceId: 'pga',
  teams: noopTeams,
  context: {
    parseLeagueContext: parseGolfLeagueContext,
    refineLeaguePhase: refineGolfLeaguePhase,
    parseContextFromSummary: (s) => parseGolfContextFromSummary(s),
    mergeContext: mergeGolfContext,
    sortGamesByContext: sortGolfGamesByContext,
  },
  espn: {
    scoreboard: espnGolfMergedScoreboard,
    athlete: espnGolfAthlete,
    searchAthletes: espnGolfSearchAthletes,
    standings: async () => {
      const res = await safeFetch('standings', () => espnGolfMergedStandings());
      if (!res.success || !res.data) return [];
      const groups = [];
      if (res.data.pga) {
        groups.push(...parseEspnIndividualStandings(res.data.pga, 'FedEx Cup'));
      }
      if (res.data.lpga) {
        groups.push(...parseEspnIndividualStandings(res.data.lpga, 'LPGA Tour'));
      }
      return groups;
    },
    teamRoster: async () => null,
    teamSchedule: async () => null,
    detail: {
      fetchSummary: (game) => {
        const tour = game.sport === 'LPGA' ? 'LPGA' : 'PGA';
        return espnGolfEventSummary(game.id, tour);
      },
      parseBoxScore: () => undefined,
      parseTeamStats: parseEspnGolfTeamStats,
      parsePlays: () => [],
      parseGameMeta: parseEspnGolfGameMeta,
      parseTopPerformers: parseEspnGolfTopPerformers,
      parseRoster: parseEspnGolfRoster,
    },
  },
  enrichment: {
    enrichGamesFromRss: enrichGolfGamesFromRss,
    enrichGamesWithOdds: async (games) => games,
    enrichTeamsWithNotes: async (teams) => teams,
    enrichRosterWithInjuries: async (roster) => roster,
    fetchFanDuelTopPerformers: async () => null,
  },
  buildPlayerDetails: (player, raw) => buildEspnPlayer(player, raw, getSportProfile('GOLF')),
  afterPlayerDetails: createHistoricalAfterPlayerDetails('GOLF'),
  mapScheduleGames: (_events, raw) => parseGolfScoreboardEvents(raw),
  getFeaturedGame: (games) =>
    sortGolfGamesByContext(games).find(
      (g) => g.context?.phase === 'finals' || (g.context?.phase === 'playoffs' && g.statusState === 'pre'),
    ),
  enrichMissingContext: async (games) =>
    Promise.all(
      games.map(async (game) => {
        try {
          if (!game.tournamentName || game.context?.headline) return game;
          if (game.context?.phase !== 'finals' && game.context?.phase !== 'playoffs') return game;

          const res = await safeFetch('enrichMissingContext', () =>
            golfRssCrossCheckMajorHint(game.tournamentName!),
          );
          const hint = res.success ? res.data : null;
          if (!hint?.headline || isScoreboardNoiseText(hint.headline)) return game;

          const badge = contextLabelFromHeadline(hint.headline);
          const ctx = mergeGolfContext(game.context, {
            headline: hint.headline,
            ...(badge ? { badge } : {}),
            priority: Math.max(game.context?.priority ?? 0, 400),
          });
          return { ...game, context: ctx };
        } catch {
          return game;
        }
      }),
    ),
  enrichGameDetail: (game, summary) => {
    if (summary) return enrichGolfGameDetail(game, summary);
    return {};
  },
};
