import type { CdnTeamSport } from '../config/siyfCdn';
import type { Game, LeagueContext, Player, PlayerDetails, StatItem } from '../types';
import type { DataSource, EngineResult, GameDetail, ResolvedTeam, StandingsGroup } from './core/types';

export type { GameDetail };

export type EngineSport = 'BASKETBALL' | 'FOOTBALL' | 'SOCCER' | 'BASEBALL' | 'GOLF' | 'TENNIS' | 'HOCKEY' | 'FIGHTS';

export interface TeamRegistryOps {
  enrichTeam: (abbr: string, partial: object) => ResolvedTeam;
  resolveLogo: (abbr: string, existing?: string) => string;
  getAllTeams: () => ResolvedTeam[];
}

export interface ContextOps {
  parseLeagueContext: (raw: unknown) => LeagueContext;
  refineLeaguePhase: (ctx: LeagueContext, games: Game[]) => LeagueContext;
  parseContextFromSummary: (summary: unknown, awayAbbr: string, homeAbbr: string, league?: string) => Partial<import('../types').GameContext> | null | undefined;
  mergeContext: (existing: import('../types').GameContext | undefined, patch: Partial<import('../types').GameContext>) => import('../types').GameContext | undefined;
  sortGamesByContext: (games: Game[]) => Game[];
}

export interface EspnDetailOps {
  fetchSummary: (game: Game) => Promise<unknown | null>;
  parseBoxScore: (summary: unknown, away: Game['away'], home: Game['home']) => GameDetail['boxScore'] | undefined;
  buildPreGameBoxScore?: (
    summary: unknown,
    away: Game['away'],
    home: Game['home'],
  ) => Promise<GameDetail['boxScore'] | undefined>;
  parseTeamStats: (summary: unknown) => GameDetail['teamStats'];
  parsePlays: (summary: unknown) => GameDetail['plays'];
  parseGameMeta: (summary: unknown) => { venue?: string; broadcast?: string; attendance?: string };
  parseTopPerformers: (summary: unknown) => Array<{ name: string; team: string; position: string; headshot?: string; stats: StatItem[]; pts?: number; score?: number }>;
  parseRoster: (data: unknown) => Array<{ id: string; name: string; position: string; number?: string; headshot?: string }>;
}

export interface EnrichmentOps {
  enrichGamesFromRss: (games: Game[]) => Promise<Game[]>;
  enrichGamesWithOdds: (games: Game[]) => Promise<Game[]>;
  enrichTeamsWithNotes: (teams: ResolvedTeam[]) => Promise<ResolvedTeam[]>;
  enrichRosterWithInjuries: (roster: Player[]) => Promise<Player[]>;
  fetchFanDuelTopPerformers: (detail: GameDetail) => Promise<GameDetail['topPerformers'] | null | undefined>;
}

export interface PlayerDetailProvider {
  id: string;
  fetch: (player: Player) => Promise<Partial<PlayerDetails> | null>;
  /** When true, only runs after free providers and only if they left gaps. */
  lastResort?: boolean;
}

export interface StandingsProvider {
  id: string;
  fetch: () => Promise<StandingsGroup[] | null>;
}

export interface SportEngineConfig {
  id: string;
  sport: EngineSport;
  /** Prefix for ESPN source cache keys (used when busting on live score changes). */
  cacheSourcePrefix?: string;
  cdnTeamKey: CdnTeamSport;
  scoreboardCacheKey: string;
  teamsCacheKey: string;
  detailCacheKey: (game: Game) => string;
  /** ESPN summary cache key — defaults to `{cacheSourcePrefix}:summary:{gameId}`. */
  summaryCacheKey?: (game: Game) => string;
  minTeamCount: number;
  notesSourceId: string;
  sportFilter?: string;
  teams: TeamRegistryOps;
  context: ContextOps;
  espn: {
    scoreboard: () => Promise<unknown>;
    athlete: (playerId: string) => Promise<unknown>;
    searchAthletes: (query: string) => Promise<unknown>;
    standings: () => Promise<StandingsGroup[]>;
    teamRoster: (teamId: string) => Promise<unknown>;
    teamSchedule: (teamId: string) => Promise<unknown>;
    detail: EspnDetailOps;
  };
  enrichment: EnrichmentOps;
  buildPlayerDetails: (player: Player, raw: unknown) => PlayerDetails;
  playerDetailProviders?: PlayerDetailProvider[];
  afterPlayerDetails?: (player: Player, detail: PlayerDetails, sources: DataSource[]) => Promise<{ detail: PlayerDetails; sources: DataSource[] }>;
  standingsProviders?: StandingsProvider[];
  mergeStandingsExtra?: (primary: StandingsGroup[], extra: StandingsGroup[]) => StandingsGroup[];
  enrichRosterExtra?: (teamId: string, roster: Player[]) => Promise<Player[]>;
  rosterExtraSourceId?: string;
  searchWithWikidata?: boolean;
  mapScheduleGames?: (events: unknown[], raw: unknown) => Game[];
  loadScoreboardExtras?: (ctx: {
    games: Game[];
    espnRaw: unknown;
    sources: DataSource[];
  }) => Promise<{ games: Game[]; espnRaw: unknown; sources: DataSource[] }>;
  enrichMissingContext?: (games: Game[], isPostseason: boolean) => Promise<Game[]>;
  getFeaturedGame?: (games: Game[]) => Game | undefined;
  getWnbaLeagueContext?: () => Promise<LeagueContext | null>;
  enrichGameDetail?: (detail: GameDetail, summary: unknown | null) => Partial<GameDetail>;
  onInit?: () => void;
}

export interface SportEngine {
  getScoreboard(): Promise<EngineResult<Game[]>>;
  /** Force next scoreboard read to bypass in-memory and edge cache. */
  bustScoreboardCache(): void;
  getLeagueContext(): LeagueContext | null;
  getGameDetail(game: Game): Promise<EngineResult<GameDetail>>;
  prefetchLiveDetails(games: Game[]): void;
  getTeams(): Promise<EngineResult<ResolvedTeam[]>>;
  getPlayerDetails(player: Player): Promise<EngineResult<PlayerDetails>>;
  searchPlayers(query: string): Promise<EngineResult<Player[]>>;
  getStandings(): Promise<EngineResult<StandingsGroup[]>>;
  getTeamRoster(teamId: string): Promise<EngineResult<Player[]>>;
  getTeamSchedule(teamId: string): Promise<EngineResult<Game[]>>;
  getFeaturedGame?(games: Game[]): Game | undefined;
  getWnbaLeagueContext?(): Promise<LeagueContext | null>;
}
