import { getEspnEvents } from './core/espnEventTypes';
import { parseEventsForSport } from '../services/parsers/parseGameEvent';
import { cacheGet, cacheGetStale, cacheIsFresh, cacheKey, cacheSetWithProfile, withCache } from './core/cache';
import { dedupeRequest } from './core/resilientFetch';
import { syncCacheFromScoreboard } from './core/cacheInvalidation';
import { CACHE_PROFILES, profileForGameState } from './core/cacheTiers';
import { cascadeFirst, cascadeMergePartial } from './core/providerRunner';
import { mergePlayerDetails } from './core/mergePayload';
import {
  boxScoreHasLiveStats,
  createEnrichGameTeams,
  createEngineLog,
  createPlayerFallback,
  createSafeFetch,
  isEspnAthleteId,
  parseEspnSearchResults,
  pickEspnSearchMatch,
  prefetchLiveDetails,
  safeRefreshTimings,
  safeTryAsync,
  safeTrySync,
  scoringPlaysToEventLog,
} from './core/engineUtils';
import { refreshGameTiming } from '../utils/gameTime';
import { filterRecentGames } from '../utils/gameFilters';
import { dedupeGamesById } from './core/mergeGames';
import { ensureTeamRegistry } from './sources/teamRegistry';
import { applySpecialClassificationToGames, applySpecialClassification } from './core/classifySpecialGame';
import {
  detailNeedsOdds,
  detailNeedsTopPerformers,
  gameMissingScores,
  shouldRunPlayerDetailProvider,
} from './core/paidApiPolicy';
import {
  enrichTeamSportScoreboard,
  patchLiveScoresFromActionNetwork,
  supportsActionNetworkScoreFallback,
} from './core/paidApiFallback';
import { getSportCapabilities } from './core/sportCapabilities';
import { wikidataSearchProvider } from './sources/wikiSources';
import type { Game, LeagueContext, Player, PlayerDetails, StatItem } from '../types';
import type { DataSource, EngineResult, GameDetail, ResolvedTeam, StandingsGroup } from './core/types';
import type { SportEngine, SportEngineConfig } from './sportConfig';

export function createSportEngine(config: SportEngineConfig): SportEngine {
  config.onInit?.();

  const caps = getSportCapabilities(config.sport);
  const log = createEngineLog(`${config.id}-engine`);
  const safeFetch = createSafeFetch(log);
  const enrichGameTeams = createEnrichGameTeams(config.teams.enrichTeam, config.teams.resolveLogo, log);

  let cachedLeagueContext: LeagueContext | null = null;
  let scoreboardRevalidateInFlight = false;

  function finalizeScoreboardGames(games: Game[]): Game[] {
    const enriched = caps.pipeline.teamLogoEnrichment
      ? games.map((g) => enrichGameTeams(g))
      : games;
    return safeRefreshTimings(enriched, log);
  }

  function mergeParallelEnrichments(base: Game[], variants: Game[][]): Game[] {
    const byId = new Map(base.map((g) => [g.id, g]));
    for (const variant of variants) {
      for (const g of variant) {
        const cur = byId.get(g.id);
        if (!cur) continue;
        byId.set(g.id, {
          ...cur,
          away: { ...cur.away, ...g.away },
          home: { ...cur.home, ...g.home },
          context: config.context.mergeContext(cur.context, g.context ?? {}) ?? cur.context,
          subtitle: g.subtitle ?? cur.subtitle,
          leaderboard: g.leaderboard ?? cur.leaderboard,
          tournamentName: g.tournamentName ?? cur.tournamentName,
        });
      }
    }
    return base.map((g) => byId.get(g.id) ?? g);
  }

  async function loadScoreboard(): Promise<EngineResult<Game[]>> {
    const sources: DataSource[] = [];
    let espnRaw: unknown = null;
    let games: Game[] = [];

    const raw = await safeTryAsync(log, 'getScoreboard', 'ESPN scoreboard', () => config.espn.scoreboard(), null);
    const espnEvents = getEspnEvents(raw);
    if (espnEvents.length) {
      espnRaw = raw;
      games = config.mapScheduleGames
        ? config.mapScheduleGames(espnEvents, raw)
        : parseEventsForSport(espnEvents, config.sport);
      if (games.length) sources.push('espn');
    }

    if (config.sportFilter) {
      games = games.filter((g) => !g.sport || g.sport === config.sportFilter);
    }

    if (caps.pipeline.scoreboardExtras && config.loadScoreboardExtras) {
      const extra = await safeTryAsync(
        log,
        'getScoreboard',
        'scoreboard extras',
        () => config.loadScoreboardExtras!({ games, espnRaw, sources: [...sources] }),
        { games, espnRaw, sources: [...sources] },
      );
      games = extra.games;
      espnRaw = extra.espnRaw;
      sources.splice(0, sources.length, ...extra.sources);
    }

    if (supportsActionNetworkScoreFallback(config.sport)) {
      const scoreResult = await enrichTeamSportScoreboard(config.sport, games, sources);
      games = scoreResult.games;
      sources.splice(0, sources.length, ...scoreResult.sources);
    }

    let league: LeagueContext | null = null;
    if (caps.pipeline.leagueContext) {
      league = safeTrySync(
        log,
        'getScoreboard',
        'league context',
        () => {
          if (!espnRaw) return cachedLeagueContext;
          const parsed = config.context.refineLeaguePhase(config.context.parseLeagueContext(espnRaw), games);
          cachedLeagueContext = parsed;
          return parsed;
        },
        cachedLeagueContext,
      );
    }

    const preEnrichGames = games;
    const enrichmentVariants: Game[][] = [];

    const enrichmentTasks: Promise<Game[]>[] = [];
    if (caps.pipeline.enrichMissingContext && config.enrichMissingContext) {
      enrichmentTasks.push(
        safeTryAsync(
          log,
          'getScoreboard',
          'missing context enrichment',
          () => config.enrichMissingContext!(preEnrichGames, league?.isPostseason ?? false),
          preEnrichGames,
        ),
      );
    }
    if (caps.pipeline.rss) {
      enrichmentTasks.push(
        safeTryAsync(
          log,
          'getScoreboard',
          'RSS enrichment',
          () => config.enrichment.enrichGamesFromRss(preEnrichGames),
          preEnrichGames,
        ),
      );
    }
    if (caps.pipeline.odds) {
      enrichmentTasks.push(
        safeTryAsync(
          log,
          'getScoreboard',
          'odds enrichment',
          () => config.enrichment.enrichGamesWithOdds(preEnrichGames),
          preEnrichGames,
        ),
      );
    }

    if (enrichmentTasks.length) {
      enrichmentVariants.push(...(await Promise.all(enrichmentTasks)));
      games = mergeParallelEnrichments(preEnrichGames, enrichmentVariants);
    }

    games = safeTrySync(log, 'getScoreboard', 'sort games', () => config.context.sortGamesByContext(games), games);

    games = dedupeGamesById(games);

    if (caps.pipeline.specialClassification) {
      games = applySpecialClassificationToGames(games);
    }

    games = filterRecentGames(games);

    if (games.length) {
      const sourcePrefix = config.cacheSourcePrefix ?? 'espn';
      syncCacheFromScoreboard(games, {
        resolveDetailKey: (g) => config.detailCacheKey(g),
        resolveSummaryKey: config.summaryCacheKey
          ?? ((g) => cacheKey(sourcePrefix, 'summary', g.id)),
      });
    }

    if (!games.length) {
      const stale = cacheGetStale<Game[]>(config.scoreboardCacheKey);
      if (stale?.length) {
        games = filterRecentGames(stale);
        sources.push('fallback');
      }
    } else {
      cacheSetWithProfile(
        config.scoreboardCacheKey,
        games,
        CACHE_PROFILES.live,
        ['scoreboard'],
      );
    }

    if (!sources.length) sources.push('fallback');

    return { data: finalizeScoreboardGames(games), sources };
  }

  function scheduleScoreboardRevalidate(): void {
    if (scoreboardRevalidateInFlight) return;
    scoreboardRevalidateInFlight = true;
    void dedupeRequest(`scoreboard:${config.scoreboardCacheKey}`, loadScoreboard).finally(() => {
      scoreboardRevalidateInFlight = false;
    });
  }

  async function getScoreboard(): Promise<EngineResult<Game[]>> {
    const cacheKey = config.scoreboardCacheKey;
    const cached = cacheGet<Game[]>(cacheKey);
    const hasLive = cached?.some((g) => g.statusState === 'in') ?? false;

    if (cached?.length && cacheIsFresh(cacheKey) && !hasLive) {
      scheduleScoreboardRevalidate();
      return { data: finalizeScoreboardGames(cached), sources: ['cache'] };
    }

    return dedupeRequest(`scoreboard:${cacheKey}`, loadScoreboard);
  }

  async function getGameDetail(game: Game): Promise<EngineResult<GameDetail>> {
    const cacheK = config.detailCacheKey(game);

    const detailProfile = profileForGameState(game.statusState);

    const { data: detail, isStale } = await withCache(
      cacheK,
      {
        ttlMs: detailProfile.ttlMs,
        staleMs: detailProfile.staleMs,
        tier: detailProfile.tier,
        tags: [`game:${game.id}`, 'detail'],
      },
      async () => {
        const sources: DataSource[] = [];
        let detail: GameDetail = { ...enrichGameTeams(game), dataSources: [] };

        const summaryRes = await safeFetch('getGameDetail.summary', () => config.espn.detail.fetchSummary(game));
        const summary = summaryRes.success ? summaryRes.data : null;

        if (summary) {
          sources.push('espn');

          if (caps.features.boxScore) {
            try {
              const isPre = game.statusState === 'pre';
              let boxScore: GameDetail['boxScore'];

              if (isPre) {
                // Scheduled games: only show curated pregame preview, never raw ESPN box score stubs.
                if (config.espn.detail.buildPreGameBoxScore) {
                  boxScore = await config.espn.detail.buildPreGameBoxScore(summary, detail.away, detail.home);
                }
              } else {
                boxScore = config.espn.detail.parseBoxScore(summary, detail.away, detail.home);
                if (boxScore && !boxScoreHasLiveStats(boxScore, config.sport) && game.statusState === 'in') {
                  boxScore.mode = boxScore.mode ?? 'live';
                }
              }

              if (boxScore) detail.boxScore = boxScore;
            } catch (err) {
              log('warn', 'getGameDetail', 'box score parse failed', err);
            }
          }

          if (caps.features.teamStats) {
            const teamStats = safeTrySync(
              log,
              'getGameDetail',
              'team stats',
              () => config.espn.detail.parseTeamStats(summary),
              undefined,
            );
            if (teamStats) detail.teamStats = teamStats;
          }

          if (caps.features.plays) {
            const plays = safeTrySync(
              log,
              'getGameDetail',
              'plays',
              () => config.espn.detail.parsePlays(summary),
              undefined,
            );
            if (plays?.length) detail.plays = plays;
          }

          const meta = safeTrySync(
            log,
            'getGameDetail',
            'game meta',
            () => config.espn.detail.parseGameMeta(summary),
            {},
          );
          if (meta.venue) detail.venue = meta.venue;
          detail.broadcast = meta.broadcast ?? detail.context?.broadcast;
          if (meta.attendance) detail.attendance = meta.attendance;

          if (caps.pipeline.leagueContext) {
            const league = (game as Game & { leagueSlug?: string }).leagueSlug;
            const summaryContext = safeTrySync(
              log,
              'getGameDetail',
              'summary context',
              () => config.context.parseContextFromSummary(
                summary,
                detail.away.abbr,
                detail.home.abbr,
                league,
              ),
              null,
            );
            if (summaryContext) {
              detail.context = config.context.mergeContext(detail.context, summaryContext);
              detail.subtitle = detail.context?.headline ?? detail.subtitle;
              detail.broadcast = detail.context?.broadcast ?? detail.broadcast;
            }
          }

          if (caps.features.boxScore || caps.layout === 'team') {
            const performers = safeTrySync(
              log,
              'getGameDetail',
              'top performers',
              () => config.espn.detail.parseTopPerformers(summary),
              [],
            );
            if (performers.length) {
              detail.topPerformers = performers.map(({ pts: _p, score: _s, stats, ...p }) => ({
                ...p,
                id: (p as { id?: string }).id ?? p.name,
                stats,
              })) as GameDetail['topPerformers'];
            }
          }

          if (caps.features.eventLog && !detail.eventLog?.length) {
            detail.eventLog = scoringPlaysToEventLog(detail.plays);
          }
        }

        if (supportsActionNetworkScoreFallback(config.sport) && (gameMissingScores(detail) || !detail.broadcast)) {
          const patched = await safeTryAsync(
            log,
            'getGameDetail',
            'action network patch',
            () => patchLiveScoresFromActionNetwork(detail, config.sport),
            null,
          );
          if (patched) {
            detail = {
              ...detail,
              away: patched.away,
              home: patched.home,
              clock: patched.clock ?? detail.clock,
              broadcast: patched.broadcast ?? detail.broadcast,
              context: patched.context
                ? config.context.mergeContext(detail.context, patched.context)
                : detail.context,
            };
            if (!sources.includes('action-network')) sources.push('action-network');
          }
        }

        if (caps.pipeline.fanDuelPerformers && detailNeedsTopPerformers(detail)) {
          const fdPerformers = await safeTryAsync(
            log,
            'getGameDetail',
            'fanduel performers',
            () => config.enrichment.fetchFanDuelTopPerformers(detail),
            null,
          );
          if (fdPerformers?.length) {
            detail.topPerformers = fdPerformers;
            sources.push('fanduel');
          }
        }

        if (caps.pipeline.odds && detailNeedsOdds(detail)) {
          const withOdds = await safeTryAsync(
            log,
            'getGameDetail',
            'odds enrichment',
            async () => {
              const [enriched] = await config.enrichment.enrichGamesWithOdds([detail]);
              return enriched;
            },
            null,
          );
          if (withOdds?.context) {
            detail.context = config.context.mergeContext(detail.context, withOdds.context);
            sources.push('odds');
          }
        }

        if (config.enrichGameDetail) {
          const extra = await safeTryAsync(
            log,
            'getGameDetail',
            'sport detail enrichment',
            () => Promise.resolve(config.enrichGameDetail!(detail, summary)),
            null,
          );
          if (extra && Object.keys(extra).length) {
            detail = { ...detail, ...extra };
          }
        }

        if (caps.pipeline.rss) {
          try {
            const [enriched] = await config.enrichment.enrichGamesFromRss([detail]);
            if (enriched) {
              detail = {
                ...detail,
                away: enriched.away,
                home: enriched.home,
                context: enriched.context ?? detail.context,
                subtitle: enriched.subtitle ?? detail.subtitle,
              };
            }
          } catch (err) {
            log('warn', 'getGameDetail', 'post-enrichment failed', err);
          }
        }

        detail.dataSources = sources.length ? sources : ['fallback'];
        return detail;
      },
    );

    let finalDetail = applySpecialClassification(detail) as GameDetail;
    if (finalDetail.timing?.startTime) {
      const refreshed = refreshGameTiming(finalDetail);
      finalDetail = { ...finalDetail, timing: refreshed.timing, clock: refreshed.clock };
      if (finalDetail.timing?.stale || isStale) {
        finalDetail.timing!.stale = true;
      }
    }

    return { data: finalDetail, sources: finalDetail.dataSources };
  }

  async function getTeams(): Promise<EngineResult<ResolvedTeam[]>> {
    if (!caps.features.teams) return { data: [], sources: ['fallback'] };

    const cached = cacheGet<ResolvedTeam[]>(config.teamsCacheKey);
    if (cached?.length) return { data: cached, sources: ['cdn'] };

    await ensureTeamRegistry(config.cdnTeamKey);
    let teams = config.teams.getAllTeams();
    if (config.minTeamCount > 0 && teams.length > 0 && teams.length < config.minTeamCount) {
      log('warn', 'getTeams', `expected >=${config.minTeamCount} teams, got ${teams.length}`);
    }
    const sources: DataSource[] = teams.length ? ['cdn'] : ['fallback'];

    if (teams.length) {
      if (caps.pipeline.teamNotes) {
        const withNotes = await safeTryAsync(
          log,
          'getTeams',
          'team notes',
          () => config.enrichment.enrichTeamsWithNotes(teams),
          null,
        );
        if (withNotes) {
          teams = withNotes;
          sources.push(config.notesSourceId);
        }
      }
      cacheSetWithProfile(config.teamsCacheKey, teams, CACHE_PROFILES.static, ['teams']);
    }

    return { data: teams, sources };
  }

  async function getPlayerDetails(player: Player): Promise<EngineResult<PlayerDetails>> {
    const sources: DataSource[] = [];
    let detail = createPlayerFallback(player, config.sport);

    let espnPlayer = player;
    if (!isEspnAthleteId(player.id)) {
      const searchRes = await safeFetch('getPlayerDetails.resolveEspnId', () =>
        config.espn.searchAthletes(player.name),
      );
      if (searchRes.success && searchRes.data) {
        const match = pickEspnSearchMatch(parseEspnSearchResults(searchRes.data), player.name);
        if (match) {
          espnPlayer = {
            ...player,
            id: match.id,
            team: match.team !== '—' ? match.team : player.team,
            position: match.position !== '—' ? match.position : player.position,
            headshot: match.headshot ?? player.headshot,
          };
        }
      }
    }

    if (isEspnAthleteId(espnPlayer.id)) {
      const res = await safeFetch('getPlayerDetails.espn', () => config.espn.athlete(espnPlayer.id));
      if (res.success && res.data) {
        const parsed = safeTrySync(
          log,
          'getPlayerDetails',
          'ESPN player parse',
          () => config.buildPlayerDetails(espnPlayer, res.data),
          null,
        );
        if (parsed) {
          detail = parsed;
          sources.push('espn');
        }
      }
    }

    const providers: Array<{
      id: string;
      lastResort?: boolean;
      fetch: () => Promise<Partial<PlayerDetails> | null>;
    }> = [];

    if (config.playerDetailProviders) {
      for (const p of config.playerDetailProviders) {
        providers.push({ id: p.id, lastResort: p.lastResort, fetch: () => p.fetch(player) });
      }
    }

    const runProviderBatch = async (
      batch: typeof providers,
    ): Promise<{ data: PlayerDetails; sources: string[] }> => {
      if (!batch.length) return { data: detail, sources: [] };
      const merges = await cascadeMergePartial<PlayerDetails>(
        batch,
        detail,
        (current, patch) => mergePlayerDetails(current, patch),
      );
      return merges;
    };

    const freeProviders = providers.filter(
      (p) => !p.lastResort && shouldRunPlayerDetailProvider(p.id, detail),
    );
    const paidProviders = providers.filter((p) => p.lastResort);

    if (freeProviders.length) {
      const merges = await runProviderBatch(freeProviders);
      detail = merges.data;
      sources.push(...merges.sources.filter((s) => s !== 'fallback'));
    }

    const activePaidProviders = paidProviders.filter((p) => shouldRunPlayerDetailProvider(p.id, detail));
    if (activePaidProviders.length) {
      const merges = await runProviderBatch(activePaidProviders);
      detail = merges.data;
      sources.push(...merges.sources.filter((s) => s !== 'fallback'));
    }

    if (config.afterPlayerDetails) {
      const result = await config.afterPlayerDetails(player, detail, sources);
      detail = result.detail;
      sources.splice(0, sources.length, ...result.sources);
    }

    return { data: detail, sources: sources.length ? sources : ['fallback'] };
  }

  async function searchPlayers(query: string): Promise<EngineResult<Player[]>> {
    if (!query.trim()) return { data: [], sources: ['fallback'] };

    const res = await safeFetch('searchPlayers.espn', () => config.espn.searchAthletes(query));
    const espnResults = res.success ? res.data : null;
    const players = parseEspnSearchResults(espnResults);
    const resultSources: DataSource[] = espnResults ? ['espn'] : [];

    if (config.searchWithWikidata && players.length < 6) {
      const wikiPlayers = await safeTryAsync(
        log,
        'searchPlayers',
        'wikidata search',
        () => wikidataSearchProvider(query),
        [],
      );
      const seen = new Set(players.map((p) => p.id));
      const seenNames = new Set(players.map((p) => p.name.trim().toLowerCase()));
      for (const p of wikiPlayers) {
        const nameKey = p.name.trim().toLowerCase();
        if (seen.has(p.id) || seenNames.has(nameKey)) continue;
        seen.add(p.id);
        seenNames.add(nameKey);
        players.push(p);
      }
      if (wikiPlayers.length) resultSources.push('wikidata');
    }

    return {
      data: players.slice(0, 12),
      sources: resultSources.length ? resultSources : ['fallback'],
    };
  }

  async function getStandings(): Promise<EngineResult<StandingsGroup[]>> {
    if (!caps.features.standings) return { data: [], sources: ['fallback'] };

    const providers = config.standingsProviders ?? [
      { id: 'espn', fetch: () => config.espn.standings() },
    ];

    const { data, sources } = await cascadeFirst<StandingsGroup[]>(providers, []);

    if (config.mergeStandingsExtra && sources.includes('espn') && sources.length === 1) {
      const extraProvider = providers.find((p) => p.id !== 'espn');
      if (extraProvider) {
        const extra = await safeTryAsync(
          log,
          'getStandings',
          'standings merge extra',
          () => extraProvider.fetch(),
          null,
        );
        if (extra?.length) {
          return {
            data: config.mergeStandingsExtra(data, extra),
            sources: ['espn', extraProvider.id],
          };
        }
      }
    }

    return { data, sources: sources.length ? sources : ['fallback'] };
  }

  async function getTeamRoster(teamId: string): Promise<EngineResult<Player[]>> {
    if (!caps.features.roster) return { data: [], sources: ['fallback'] };

    try {
      const res = await safeFetch('getTeamRoster', () => config.espn.teamRoster(teamId));
      const data = res.success ? res.data : null;
      if (!data) return { data: [], sources: ['fallback'] };

      let roster = config.espn.detail.parseRoster(data).map((p) => ({
        ...p,
        team: '',
        stats: [] as StatItem[],
      }));

      const resultSources: DataSource[] = ['espn'];

      if (config.enrichRosterExtra) {
        const enrichedRoster = await safeTryAsync(
          log,
          'getTeamRoster',
          'roster extra',
          () => config.enrichRosterExtra!(teamId, roster),
          null,
        );
        if (enrichedRoster) {
          roster = enrichedRoster;
          if (config.rosterExtraSourceId) resultSources.push(config.rosterExtraSourceId);
        }
      }

      if (caps.pipeline.injuryEnrichment) {
        const withInjuries = await safeTryAsync(
          log,
          'getTeamRoster',
          'injury enrichment',
          () => config.enrichment.enrichRosterWithInjuries(roster),
          null,
        );
        if (withInjuries) {
          roster = withInjuries;
          resultSources.push('rotoworld');
        }
      }

      return { data: roster, sources: resultSources };
    } catch {
      return { data: [], sources: ['fallback'] };
    }
  }

  async function getTeamSchedule(teamId: string): Promise<EngineResult<Game[]>> {
    if (!caps.features.schedule) return { data: [], sources: ['fallback'] };

    const res = await safeFetch('getTeamSchedule', () => config.espn.teamSchedule(teamId));
    if (!res.success || !res.data) return { data: [], sources: ['fallback'] };

    const payload = res.data as { events?: unknown[] };
    if (!Array.isArray(payload.events) || !payload.events.length) {
      return { data: [], sources: ['fallback'] };
    }

    const games = config.mapScheduleGames
      ? config.mapScheduleGames(payload.events, res.data)
      : parseEventsForSport(payload.events, config.sport);

    const enriched = caps.pipeline.teamLogoEnrichment
      ? games.map(enrichGameTeams)
      : games;
    return { data: enriched, sources: ['espn'] };
  }

  const engine: SportEngine = {
    getScoreboard,
    getLeagueContext: () => cachedLeagueContext,
    getGameDetail,
    prefetchLiveDetails: (games) => prefetchLiveDetails((g) => getGameDetail(g), games, log),
    getTeams,
    getPlayerDetails,
    searchPlayers,
    getStandings,
    getTeamRoster,
    getTeamSchedule,
  };

  if (config.getFeaturedGame) {
    engine.getFeaturedGame = config.getFeaturedGame;
  }
  if (config.getWnbaLeagueContext) {
    engine.getWnbaLeagueContext = config.getWnbaLeagueContext;
  }

  return engine;
}
