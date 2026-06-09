import {
  mergeTennisContext,
  parseTennisContextFromSummary,
  parseTennisLeagueContext,
  refineTennisLeaguePhase,
  sortTennisGamesByContext,
} from '../../services/parsers/parseTennisContext';
import { cacheKey } from '../core/cache';
import {
  createBuildEspnPlayerDetails,
  createEngineLog,
  createParseGameLog,
  createParseSeasonHistory,
  createSafeFetch,
  TENNIS_LABEL_INDEX,
} from '../core/engineUtils';
import {
  enrichTennisGameDetail,
  espnTennisAthlete,
  espnTennisMatchSummary,
  espnTennisMergedScoreboard,
  espnTennisMergedStandings,
  espnTennisSearchAthletes,
  parseEspnTennisGameMeta,
  parseEspnTennisRoster,
  parseEspnTennisTeamStats,
  parseEspnTennisTopPerformers,
  parseTennisScoreboardEvents,
} from '../sources/espnTennisSource';
import { noopTeams } from '../sources/individualSportStubs';
import { enrichTennisGames, tennisRssCrossCheckTournamentHint } from '../sources/tennisRssEnricher';
import { parseEspnIndividualStandings } from '../core/standingsUtils';
import { getSportProfile } from '../../config/sportProfiles';
import { createHistoricalAfterPlayerDetails } from '../sources/historicalSources';
import type { SportEngineConfig } from '../sportConfig';

const log = createEngineLog('tennis-engine');
const safeFetch = createSafeFetch(log);
const parseSeasonHistory = createParseSeasonHistory(TENNIS_LABEL_INDEX, log);
const parseGameLog = createParseGameLog(TENNIS_LABEL_INDEX, log);
const buildEspnPlayer = createBuildEspnPlayerDetails(
  ['Rank', 'Aces', 'DF', '1st Serve %', 'BP Won', 'W', 'L'],
  parseSeasonHistory,
  parseGameLog,
  log,
);

export const tennisConfig: SportEngineConfig = {
  id: 'tennis',
  sport: 'TENNIS',
  cacheSourcePrefix: 'espn-tennis',
  cdnTeamKey: 'nba',
  scoreboardCacheKey: cacheKey('tennis-engine', 'scoreboard', 'today'),
  teamsCacheKey: cacheKey('tennis-teams', 'atp'),
  detailCacheKey: (game) => cacheKey('tennis-detail', game.id),
  minTeamCount: 0,
  notesSourceId: 'atp',
  teams: noopTeams,
  context: {
    parseLeagueContext: parseTennisLeagueContext,
    refineLeaguePhase: refineTennisLeaguePhase,
    parseContextFromSummary: (s) => parseTennisContextFromSummary(s),
    mergeContext: mergeTennisContext,
    sortGamesByContext: sortTennisGamesByContext,
  },
  espn: {
    scoreboard: espnTennisMergedScoreboard,
    athlete: espnTennisAthlete,
    searchAthletes: espnTennisSearchAthletes,
    standings: async () => {
      const res = await safeFetch('standings', () => espnTennisMergedStandings());
      if (!res.success || !res.data) return [];
      const groups = [];
      if (res.data.atp) {
        groups.push(...parseEspnIndividualStandings(res.data.atp, 'ATP Rankings'));
      }
      if (res.data.wta) {
        groups.push(...parseEspnIndividualStandings(res.data.wta, 'WTA Rankings'));
      }
      return groups;
    },
    teamRoster: async () => null,
    teamSchedule: async () => null,
    detail: {
      fetchSummary: (game) => espnTennisMatchSummary(game),
      parseBoxScore: () => undefined,
      parseTeamStats: parseEspnTennisTeamStats,
      parsePlays: () => [],
      parseGameMeta: parseEspnTennisGameMeta,
      parseTopPerformers: parseEspnTennisTopPerformers,
      parseRoster: parseEspnTennisRoster,
    },
  },
  enrichment: {
    enrichGamesFromRss: enrichTennisGames,
    enrichGamesWithOdds: async (games) => games,
    enrichTeamsWithNotes: async (teams) => teams,
    enrichRosterWithInjuries: async (roster) => roster,
    fetchFanDuelTopPerformers: async () => null,
  },
  buildPlayerDetails: (player, raw) => buildEspnPlayer(player, raw, getSportProfile('TENNIS')),
  afterPlayerDetails: createHistoricalAfterPlayerDetails('TENNIS'),
  mapScheduleGames: (_events, raw) => parseTennisScoreboardEvents(raw),
  getFeaturedGame: (games) =>
    sortTennisGamesByContext(games).find(
      (g) => g.context?.phase === 'finals' || (g.context?.phase === 'playoffs' && g.statusState === 'pre'),
    ),
  enrichMissingContext: async (games) =>
    Promise.all(
      games.map(async (game) => {
        try {
          if (!game.tournamentName || game.context?.headline) return game;
          if (game.context?.phase !== 'finals' && game.context?.phase !== 'playoffs') return game;

          const res = await safeFetch('enrichMissingContext', () =>
            tennisRssCrossCheckTournamentHint(game.tournamentName!, game.away.name),
          );
          const hint = res.success ? res.data : null;
          if (!hint?.headline) return game;

          const ctx = mergeTennisContext(game.context, {
            headline: hint.headline,
            badge: hint.headline.slice(0, 40).toUpperCase(),
            priority: Math.max(game.context?.priority ?? 0, 400),
          });
          return { ...game, context: ctx, subtitle: hint.headline };
        } catch {
          return game;
        }
      }),
    ),
  enrichGameDetail: (game, summary) => {
    if (summary) return enrichTennisGameDetail(game, summary);
    return {};
  },
};
