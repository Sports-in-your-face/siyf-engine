import {
  mergeHockeyContext,
  parseHockeyContextFromSummary,
  parseHockeyLeagueContext,
  refineHockeyLeaguePhase,
  sortHockeyGamesByContext,
} from '../../services/parsers/parseHockeyContext';
import { guardedEspnTeamSummaryEventId } from '../core/espnSummaryGuard';
import { cacheKey } from '../core/cache';
import {
  createBuildEspnPlayerDetails,
  createEngineLog,
  createParseGameLog,
  createParseSeasonHistory,
  createSafeFetch,
  HOCKEY_LABEL_INDEX,
} from '../core/engineUtils';
import {
  buildEspnNhlPreGameBoxScore,
  espnNhlAthlete,
  espnNhlScoreboard,
  espnNhlSearchAthletes,
  espnNhlStandings,
  espnNhlSummary,
  espnNhlTeamRoster,
  espnNhlTeamSchedule,
  parseEspnNhlBoxScore,
  parseEspnNhlGameMeta,
  parseEspnNhlPlays,
  parseEspnNhlRoster,
  parseEspnNhlTeamStats,
  parseEspnNhlTopPerformers,
  enrichEspnNhlRosterSeasonStats,
} from '../sources/espnNhlSource';
import { enrichNhlGamesWithOdds, fetchNhlFanDuelTopPerformers } from '../sources/nhlOddsSources';
import {
  enrichNhlGamesFromRss,
  enrichNhlRosterWithInjuries,
  enrichNhlTeamsWithNotes,
  nhlRssCrossCheckPlayoffHint,
} from '../sources/nhlRssEnricher';
import { enrichNhlTeam, getAllNhlTeams, resolveNhlTeamLogo } from '../sources/teamRegistry';
import { getSportProfile } from '../../config/sportProfiles';
import { isScoreboardNoiseText, contextLabelFromHeadline } from '../../utils/scoreboardNoise';
import { createHistoricalAfterPlayerDetails } from '../sources/historicalSources';
import type { SportEngineConfig } from '../sportConfig';

const log = createEngineLog('hockey-engine');
const safeFetch = createSafeFetch(log);
const parseSeasonHistory = createParseSeasonHistory(HOCKEY_LABEL_INDEX, log);
const parseGameLog = createParseGameLog(HOCKEY_LABEL_INDEX, log);
const buildEspnPlayer = createBuildEspnPlayerDetails(
  ['G', 'A', 'PTS', 'SOG', 'SV%', 'GA', 'HIT', 'BLK'],
  parseSeasonHistory,
  parseGameLog,
  log,
);

export const hockeyConfig: SportEngineConfig = {
  id: 'hockey',
  sport: 'HOCKEY',
  cacheSourcePrefix: 'espn-nhl',
  cdnTeamKey: 'nhl',
  scoreboardCacheKey: cacheKey('hockey-engine', 'scoreboard', 'today'),
  teamsCacheKey: cacheKey('hockey-teams', 'nhl'),
  detailCacheKey: (game) => cacheKey('hockey-detail', game.id),
  minTeamCount: 30,
  notesSourceId: 'tsn_nhl',
  sportFilter: 'HOCKEY',
  teams: { enrichTeam: enrichNhlTeam, resolveLogo: resolveNhlTeamLogo, getAllTeams: getAllNhlTeams },
  context: {
    parseLeagueContext: parseHockeyLeagueContext,
    refineLeaguePhase: refineHockeyLeaguePhase,
    parseContextFromSummary: (s, a, h) => parseHockeyContextFromSummary(s, a, h),
    mergeContext: mergeHockeyContext,
    sortGamesByContext: sortHockeyGamesByContext,
  },
  espn: {
    scoreboard: espnNhlScoreboard,
    athlete: espnNhlAthlete,
    searchAthletes: espnNhlSearchAthletes,
    standings: espnNhlStandings,
    teamRoster: espnNhlTeamRoster,
    teamSchedule: espnNhlTeamSchedule,
    detail: {
      fetchSummary: (game) => {
        const eventId = guardedEspnTeamSummaryEventId(game);
        return eventId ? espnNhlSummary(eventId, game.statusState) : Promise.resolve(null);
      },
      buildPreGameBoxScore: buildEspnNhlPreGameBoxScore,
      parseBoxScore: parseEspnNhlBoxScore,
      parseTeamStats: parseEspnNhlTeamStats,
      parsePlays: parseEspnNhlPlays,
      parseGameMeta: parseEspnNhlGameMeta,
      parseTopPerformers: parseEspnNhlTopPerformers,
      parseRoster: parseEspnNhlRoster,
    },
  },
  enrichment: {
    enrichGamesFromRss: enrichNhlGamesFromRss,
    enrichGamesWithOdds: enrichNhlGamesWithOdds,
    enrichTeamsWithNotes: enrichNhlTeamsWithNotes,
    enrichRosterWithInjuries: enrichNhlRosterWithInjuries,
    fetchFanDuelTopPerformers: fetchNhlFanDuelTopPerformers,
  },
  buildPlayerDetails: (player, raw) => buildEspnPlayer(player, raw, getSportProfile('HOCKEY')),
  afterPlayerDetails: createHistoricalAfterPlayerDetails('HOCKEY'),
  enrichTeamRosterStats: enrichEspnNhlRosterSeasonStats,
  getFeaturedGame: (games) =>
    sortHockeyGamesByContext(games).find(
      (g) => g.context?.phase === 'finals' || (g.context?.phase === 'playoffs' && g.statusState === 'pre'),
    ),
  enrichMissingContext: async (games, isPostseason) => {
    if (!isPostseason) return games;
    return Promise.all(
      games.map(async (game) => {
        try {
          if (game.sport && game.sport !== 'HOCKEY') return game;
          if (game.context?.headline) return game;
          if (game.context?.phase !== 'finals' && game.context?.phase !== 'playoffs') return game;

          const res = await safeFetch('enrichMissingContext', () =>
            nhlRssCrossCheckPlayoffHint(game.away.name, game.home.name),
          );
          const hint = res.success ? res.data : null;
          if (!hint?.headline || isScoreboardNoiseText(hint.headline)) return game;

          const badge = contextLabelFromHeadline(hint.headline);
          const ctx = mergeHockeyContext(game.context, {
            phase: game.context?.phase ?? 'playoffs',
            headline: hint.headline,
            ...(badge ? { badge } : {}),
            priority: 750,
          });
          return { ...game, context: ctx };
        } catch {
          return game;
        }
      }),
    );
  },
};
