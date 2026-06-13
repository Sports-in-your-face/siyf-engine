import {
  mergeFightContext,
  parseFightContextFromSummary,
  parseFightLeagueContext,
  refineFightLeaguePhase,
  sortFightsGamesByContext,
} from '../../services/parsers/parseFightContext';
import { cacheKey } from '../core/cache';
import {
  createBuildEspnPlayerDetails,
  createEngineLog,
} from '../core/engineUtils';
import {
  espnFightEventSummary,
  espnMmaAthlete,
  espnMmaSearchAthletes,
  espnUfcScoreboard,
  espnUfcStandings,
  parseEspnMmaGameMeta,
  parseEspnMmaRoster,
  parseEspnMmaTopPerformers,
  parseFightScoreboardEvents,
} from '../sources/espnMmaSource';
import { enrichFightGameDetail } from '../../services/parsers/parseFightEvents';
import { fetchSupplementalFightScoreboards } from '../sources/fightSupplementalFeeds';
import { enrichFightGamesFromRss } from '../sources/fightsRssEnricher';
import { noopTeams } from '../sources/individualSportStubs';
import { getSportProfile } from '../../config/sportProfiles';
import { tryScoreboardStep } from '../core/scoreboardExtras';
import { createHistoricalAfterPlayerDetails } from '../sources/historicalSources';
import { dedupeGamesById } from '../core/mergeGames';
import type { SportEngineConfig } from '../sportConfig';
import type { Game } from '../../types';

const log = createEngineLog('fights-engine');
const buildEspnPlayer = createBuildEspnPlayerDetails(
  ['W', 'L', 'D', 'KO', 'SUB', 'DEC', 'Record'],
  () => [],
  () => [],
  log,
);

export const fightsConfig: SportEngineConfig = {
  id: 'fights',
  sport: 'FIGHTS',
  cacheSourcePrefix: 'espn-mma',
  cdnTeamKey: 'nba',
  scoreboardCacheKey: cacheKey('fights-engine', 'scoreboard', 'today'),
  teamsCacheKey: cacheKey('fights-teams', 'all'),
  detailCacheKey: (game) => cacheKey('fights-detail', game.leagueSlug ?? 'ufc', game.id),
  minTeamCount: 0,
  notesSourceId: 'ufc',
  teams: noopTeams,
  context: {
    parseLeagueContext: parseFightLeagueContext,
    refineLeaguePhase: refineFightLeaguePhase,
    parseContextFromSummary: () => parseFightContextFromSummary(),
    mergeContext: mergeFightContext,
    sortGamesByContext: sortFightsGamesByContext,
  },
  espn: {
    scoreboard: espnUfcScoreboard,
    athlete: espnMmaAthlete,
    searchAthletes: espnMmaSearchAthletes,
    standings: espnUfcStandings,
    teamRoster: async () => null,
    teamSchedule: async () => null,
    detail: {
      fetchSummary: (game) => espnFightEventSummary(game),
      parseBoxScore: () => undefined,
      parseTeamStats: () => undefined,
      parsePlays: () => [],
      parseGameMeta: parseEspnMmaGameMeta,
      parseTopPerformers: parseEspnMmaTopPerformers,
      parseRoster: parseEspnMmaRoster,
    },
  },
  enrichment: {
    enrichGamesFromRss: enrichFightGamesFromRss,
    enrichGamesWithOdds: async (games) => games,
    enrichTeamsWithNotes: async (teams) => teams,
    enrichRosterWithInjuries: async (roster) => roster,
    fetchFanDuelTopPerformers: async () => null,
  },
  buildPlayerDetails: (player, raw) => buildEspnPlayer(player, raw, getSportProfile('FIGHTS')),
  afterPlayerDetails: createHistoricalAfterPlayerDetails('FIGHTS'),
  mapScheduleGames: (_events, raw) => parseFightScoreboardEvents(raw),
  loadScoreboardExtras: async ({ games, espnRaw, sources }) => {
    let nextGames = games;
    const nextSources = [...sources];

    const supplemental = await tryScoreboardStep(
      'fights',
      'supplemental scoreboards',
      fetchSupplementalFightScoreboards,
      { games: [], sources: [] },
    );
    if (supplemental.games.length) {
      nextGames = dedupeGamesById([...nextGames, ...supplemental.games]);
      nextSources.push(...supplemental.sources);
    }

    return { games: nextGames, espnRaw, sources: nextSources };
  },
  getFeaturedGame: (games) =>
    sortFightsGamesByContext(games).find(
      (g) => g.statusState === 'in' || (g.statusState === 'pre' && (g.context?.priority ?? 0) >= 600),
    ),
  enrichGameDetail: (game: Game, summary) => {
    if (summary) return enrichFightGameDetail(game, summary);
    return {};
  },
};
