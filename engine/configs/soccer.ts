import { parseEventsForSport } from '../../services/parsers/parseGameEvent';
import {
  mergeSoccerContext,
  parseSoccerContextFromSummary,
  parseSoccerLeagueContext,
  refineSoccerLeaguePhase,
  sortSoccerGamesByContext,
} from '../../services/parsers/parseSoccerContext';
import { cacheKey } from '../core/cache';
import {
  SOCCER_LABEL_INDEX,
  createBuildEspnPlayerDetails,
  createEngineLog,
  createParseGameLog,
  createParseSeasonHistory,
  createSafeFetch,
} from '../core/engineUtils';
import {
  DEFAULT_SOCCER_LEAGUE,
  espnSoccerScoreboard,
  espnSoccerSummary,
  extractLeagueSlug,
  parseEspnSoccerBoxScore,
  parseEspnSoccerGameMeta,
  parseEspnSoccerPlays,
  parseEspnSoccerRoster,
  parseEspnSoccerTeamStats,
  parseEspnSoccerTopPerformers,
} from '../sources/espnSoccerSource';
import {
  fetchSoccerStandingsAllLeagues,
  resolveSoccerAthlete,
  resolveSoccerTeamRoster,
  resolveSoccerTeamSchedule,
  searchSoccerAthletesAllLeagues,
} from '../sources/soccerLeagueOps';
import { fetchSupplementalSoccerScoreboards } from '../sources/soccerSupplementalFeeds';
import { enrichSoccerGamesWithOdds, fetchSoccerFanDuelTopPerformers } from '../sources/soccerOddsSources';
import {
  enrichSoccerGamesFromRss,
  enrichSoccerRosterWithInjuries,
  enrichSoccerTeamsWithNotes,
  fetchSoccerPlayerRumors,
  soccerRssCrossCheckMatchHint,
} from '../sources/soccerRssEnricher';
import { enrichSoccerTeam, getAllSoccerTeams, resolveSoccerTeamLogo } from '../sources/teamRegistry';
import { getSportProfile } from '../../config/sportProfiles';
import { findEspnEventById, getEspnEvents } from '../core/espnEventTypes';
import { tryScoreboardStep } from '../core/scoreboardExtras';
import { createHistoricalAfterPlayerDetails } from '../sources/historicalSources';
import type { Game } from '../../types';
import type { DataSource } from '../core/types';
import type { SportEngineConfig } from '../sportConfig';

const log = createEngineLog('soccer-engine');
const safeFetch = createSafeFetch(log);
const parseSeasonHistory = createParseSeasonHistory(SOCCER_LABEL_INDEX, log);
const parseGameLog = createParseGameLog(SOCCER_LABEL_INDEX, log);
const buildEspnPlayer = createBuildEspnPlayerDetails(
  ['G', 'A', 'SH', 'ST', 'FC', 'GP', 'MIN', 'GL', 'AST', 'SHT'],
  parseSeasonHistory,
  parseGameLog,
  log,
);

function resolveLeague(game: Game): string {
  return game.leagueSlug ?? DEFAULT_SOCCER_LEAGUE;
}

function attachLeagueSlug(games: Game[], events: ReturnType<typeof getEspnEvents>): Game[] {
  return games.map((g) => {
    const event = findEspnEventById(events, g.id);
    return {
      ...g,
      leagueSlug: g.leagueSlug ?? extractLeagueSlug(event, event?.competitions?.[0]),
    };
  });
}

function dedupeGames(games: Game[]): Game[] {
  const map = new Map<string, Game>();
  for (const g of games) {
    const key = `${g.leagueSlug ?? 'eng.1'}:${g.id}`;
    if (!map.has(key)) map.set(key, g);
  }
  return Array.from(map.values());
}

export const soccerConfig: SportEngineConfig = {
  id: 'soccer',
  sport: 'SOCCER',
  cacheSourcePrefix: 'espn-soccer',
  cdnTeamKey: 'epl',
  scoreboardCacheKey: cacheKey('soccer-engine', 'scoreboard', 'today'),
  teamsCacheKey: cacheKey('soccer-teams', 'epl'),
  detailCacheKey: (game) => cacheKey('soccer-detail', resolveLeague(game), game.id),
  summaryCacheKey: (game) => cacheKey('espn-soccer', resolveLeague(game), 'summary', game.id),
  minTeamCount: 18,
  notesSourceId: 'guardian',
  sportFilter: 'SOCCER',
  teams: { enrichTeam: enrichSoccerTeam, resolveLogo: resolveSoccerTeamLogo, getAllTeams: getAllSoccerTeams },
  context: {
    parseLeagueContext: parseSoccerLeagueContext,
    refineLeaguePhase: refineSoccerLeaguePhase,
    parseContextFromSummary: (s, a, h, league) => parseSoccerContextFromSummary(s, a, h, league ?? DEFAULT_SOCCER_LEAGUE),
    mergeContext: mergeSoccerContext,
    sortGamesByContext: sortSoccerGamesByContext,
  },
  espn: {
    scoreboard: () => espnSoccerScoreboard(DEFAULT_SOCCER_LEAGUE),
    athlete: resolveSoccerAthlete,
    searchAthletes: searchSoccerAthletesAllLeagues,
    standings: fetchSoccerStandingsAllLeagues,
    teamRoster: resolveSoccerTeamRoster,
    teamSchedule: resolveSoccerTeamSchedule,
    detail: {
      fetchSummary: async (game) => {
        const league = resolveLeague(game);
        const state = game.statusState;
        const primary = await espnSoccerSummary(game.id, league, state);
        if (primary) return primary;
        if (league !== DEFAULT_SOCCER_LEAGUE) {
          return espnSoccerSummary(game.id, DEFAULT_SOCCER_LEAGUE, state);
        }
        return null;
      },
      parseBoxScore: parseEspnSoccerBoxScore,
      parseTeamStats: parseEspnSoccerTeamStats,
      parsePlays: parseEspnSoccerPlays,
      parseGameMeta: parseEspnSoccerGameMeta,
      parseTopPerformers: parseEspnSoccerTopPerformers,
      parseRoster: parseEspnSoccerRoster,
    },
  },
  enrichment: {
    enrichGamesFromRss: enrichSoccerGamesFromRss,
    enrichGamesWithOdds: enrichSoccerGamesWithOdds,
    enrichTeamsWithNotes: enrichSoccerTeamsWithNotes,
    enrichRosterWithInjuries: enrichSoccerRosterWithInjuries,
    fetchFanDuelTopPerformers: fetchSoccerFanDuelTopPerformers,
  },
  buildPlayerDetails: (player, raw) => buildEspnPlayer(player, raw, getSportProfile('SOCCER')),
  afterPlayerDetails: createHistoricalAfterPlayerDetails('SOCCER'),
  playerDetailProviders: [
    {
      id: 'transfer_rumors',
      fetch: async (player) => {
        const rumors = await fetchSoccerPlayerRumors(player);
        return rumors.length ? { rumors } : null;
      },
    },
  ],
  mapScheduleGames: (events, raw) => {
    const fromRaw = getEspnEvents(raw);
    const espnEvents = fromRaw.length ? fromRaw : getEspnEvents({ events });
    const eventList = Array.isArray(events) ? events : espnEvents;
    return attachLeagueSlug(parseEventsForSport(eventList, 'SOCCER'), espnEvents);
  },
  loadScoreboardExtras: async ({ games, espnRaw, sources }) => {
    let nextGames = games;
    const nextSources: DataSource[] = [...sources];

    const supplemental = await tryScoreboardStep(
      'soccer',
      'supplemental scoreboards',
      fetchSupplementalSoccerScoreboards,
      { games: [], sources: [] },
    );
    if (supplemental.games.length) {
      nextGames = dedupeGames([...nextGames, ...supplemental.games]);
      nextSources.push(...supplemental.sources);
    }

    return { games: nextGames, espnRaw, sources: nextSources };
  },
  enrichMissingContext: async (games, isPostseason) => {
    if (!isPostseason) return games;
    return Promise.all(
      games.map(async (game) => {
        try {
          if (game.sport && game.sport !== 'SOCCER') return game;
          if (game.context?.headline) return game;
          if (game.context?.phase !== 'finals' && game.context?.phase !== 'playoffs') return game;

          const res = await safeFetch('enrichMissingContext', () =>
            soccerRssCrossCheckMatchHint(game.away.name, game.home.name),
          );
          const hint = res.success ? res.data : null;
          if (!hint?.headline) return game;

          const ctx = mergeSoccerContext(game.context, {
            phase: game.context?.phase ?? 'playoffs',
            headline: hint.headline,
            badge: hint.headline.toUpperCase().slice(0, 40),
            priority: 850,
          });
          return { ...game, context: ctx, subtitle: hint.headline };
        } catch (err) {
          log('warn', 'enrichMissingContext', `RSS hint failed for ${game.id}`, err);
          return game;
        }
      }),
    );
  },
};
