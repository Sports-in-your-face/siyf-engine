import {
  mergeFootballContext,
  parseFootballContextFromSummary,
  parseFootballLeagueContext,
  refineFootballLeaguePhase,
  sortFootballGamesByContext,
} from '../../services/parsers/parseFootballContext';
import { guardedEspnTeamSummaryEventId } from '../core/espnSummaryGuard';
import { cacheKey } from '../core/cache';
import {
  FOOTBALL_LABEL_INDEX,
  createBuildEspnPlayerDetails,
  createEngineLog,
  createParseGameLog,
  createParseSeasonHistory,
  createSafeFetch,
} from '../core/engineUtils';
import {
  espnNflAthlete,
  espnNflScoreboard,
  espnNflSearchAthletes,
  espnNflStandings,
  espnNflSummary,
  espnNflTeamRoster,
  espnNflTeamSchedule,
  parseEspnNflBoxScore,
  buildEspnNflPreGameBoxScore,
  parseEspnNflGameMeta,
  parseEspnNflPlays,
  parseEspnNflRoster,
  parseEspnNflTeamStats,
  parseEspnNflTopPerformers,
  enrichEspnNflRosterSeasonStats,
} from '../sources/espnNflSource';
import { enrichNflGamesWithOdds, fetchNflFanDuelTopPerformers } from '../sources/nflOddsSources';
import {
  enrichNflGamesFromRss,
  enrichNflRosterWithInjuries,
  enrichNflTeamsWithNotes,
  fetchNflPlayerRumors,
  nflRssCrossCheckPlayoffHint,
} from '../sources/nflRssEnricher';
import { enrichNflTeam, getAllNflTeams, resolveNflTeamLogo } from '../sources/teamRegistry';
import { isScoreboardNoiseText, contextLabelFromHeadline } from '../../utils/scoreboardNoise';
import { getSportProfile } from '../../config/sportProfiles';
import { createHistoricalAfterPlayerDetails } from '../sources/historicalSources';
import type { SportEngineConfig } from '../sportConfig';

const log = createEngineLog('football-engine');
const safeFetch = createSafeFetch(log);
const parseSeasonHistory = createParseSeasonHistory(FOOTBALL_LABEL_INDEX, log);
const parseGameLog = createParseGameLog(FOOTBALL_LABEL_INDEX, log);
const buildEspnPlayer = createBuildEspnPlayerDetails(
  ['PASS YDS', 'RUSH YDS', 'REC YDS', 'TD', 'INT', 'QBR', 'YDS', 'CMP', 'ATT', 'SACKS'],
  parseSeasonHistory,
  parseGameLog,
  log,
);

export const footballConfig: SportEngineConfig = {
  id: 'football',
  sport: 'FOOTBALL',
  cacheSourcePrefix: 'espn-nfl',
  cdnTeamKey: 'nfl',
  scoreboardCacheKey: cacheKey('football-engine', 'scoreboard', 'today'),
  teamsCacheKey: cacheKey('football-teams', 'nfl'),
  detailCacheKey: (game) => cacheKey('football-detail', game.id),
  minTeamCount: 32,
  notesSourceId: 'pft',
  sportFilter: 'FOOTBALL',
  teams: { enrichTeam: enrichNflTeam, resolveLogo: resolveNflTeamLogo, getAllTeams: getAllNflTeams },
  context: {
    parseLeagueContext: parseFootballLeagueContext,
    refineLeaguePhase: refineFootballLeaguePhase,
    parseContextFromSummary: (s, a, h) => parseFootballContextFromSummary(s, a, h),
    mergeContext: mergeFootballContext,
    sortGamesByContext: sortFootballGamesByContext,
  },
  espn: {
    scoreboard: espnNflScoreboard,
    athlete: espnNflAthlete,
    searchAthletes: espnNflSearchAthletes,
    standings: espnNflStandings,
    teamRoster: espnNflTeamRoster,
    teamSchedule: espnNflTeamSchedule,
    detail: {
      fetchSummary: (game) => {
        const eventId = guardedEspnTeamSummaryEventId(game);
        return eventId ? espnNflSummary(eventId, game.statusState) : Promise.resolve(null);
      },
      buildPreGameBoxScore: buildEspnNflPreGameBoxScore,
      parseBoxScore: parseEspnNflBoxScore,
      parseTeamStats: parseEspnNflTeamStats,
      parsePlays: parseEspnNflPlays,
      parseGameMeta: parseEspnNflGameMeta,
      parseTopPerformers: parseEspnNflTopPerformers,
      parseRoster: parseEspnNflRoster,
    },
  },
  enrichment: {
    enrichGamesFromRss: enrichNflGamesFromRss,
    enrichGamesWithOdds: enrichNflGamesWithOdds,
    enrichTeamsWithNotes: enrichNflTeamsWithNotes,
    enrichRosterWithInjuries: enrichNflRosterWithInjuries,
    fetchFanDuelTopPerformers: fetchNflFanDuelTopPerformers,
  },
  buildPlayerDetails: (player, raw) => buildEspnPlayer(player, raw, getSportProfile('FOOTBALL')),
  afterPlayerDetails: createHistoricalAfterPlayerDetails('FOOTBALL'),
  enrichTeamRosterStats: enrichEspnNflRosterSeasonStats,
  playerDetailProviders: [
    {
      id: 'pft_rumors',
      fetch: async (player) => {
        const rumors = await fetchNflPlayerRumors(player);
        return rumors.length ? { rumors } : null;
      },
    },
  ],
  enrichMissingContext: async (games, isPostseason) => {
    if (!isPostseason) return games;
    return Promise.all(
      games.map(async (game) => {
        try {
          if (game.sport && game.sport !== 'FOOTBALL') return game;
          if (game.context?.headline) return game;
          if (game.context?.phase !== 'finals' && game.context?.phase !== 'playoffs') return game;

          const res = await safeFetch('enrichMissingContext', () =>
            nflRssCrossCheckPlayoffHint(game.away.name, game.home.name),
          );
          const hint = res.success ? res.data : null;
          if (!hint?.headline || isScoreboardNoiseText(hint.headline)) return game;

          const badge = contextLabelFromHeadline(hint.headline);
          const ctx = mergeFootballContext(game.context, {
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
};
