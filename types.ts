import type { GameTiming } from './utils/gameTime';

export type { GameTiming } from './utils/gameTime';

export interface StatItem {
  label: string;
  value: string | number;
}

export interface Player {
  id: string;
  name: string;
  team: string;
  position: string;
  /** League tag when sport tab differs (e.g. WNBA under BASKETBALL). */
  leagueSport?: string;
  headshot?: string;
  stats: StatItem[];
  headshotUrl?: string;
  number?: string;
  height?: string;
  weight?: string;
  /** Short injury tag from ESPN or RSS (e.g. Out, Questionable). */
  injuryStatus?: string;
  teamAccent?: string;
}

export interface PlayerStatSplit {
  name: string;
  stats: StatItem[];
}

export interface PlayerSeasonRow {
  season: string;
  team?: string;
  gp: string;
  min: string;
  pts: string;
  reb: string;
  ast: string;
  stl: string;
  blk: string;
  fgPct: string;
  fg3Pct: string;
  ftPct: string;
  to: string;
}

export interface PlayerGameLogRow {
  date: string;
  matchup: string;
  result: string;
  min: string;
  pts: string;
  reb: string;
  ast: string;
  stl: string;
  blk: string;
}

export interface PlayerAward {
  name: string;
  count: string;
  seasons: string[];
}

export interface PlayerDetails {
  id: string;
  name: string;
  team: string;
  position: string;
  teamAccent?: string;
  number?: string;
  height?: string;
  weight?: string;
  headshot?: string;
  debutYear?: number;
  injuryStatus?: string;
  rumors?: string[];
  heroStats: StatItem[];
  seasonSplits: PlayerStatSplit[];
  seasonHistory: PlayerSeasonRow[];
  recentGames: PlayerGameLogRow[];
  awards: PlayerAward[];
}

export interface Team {
  /** ESPN team / athlete id when available (bookmark matching). */
  id?: string;
  name: string;
  abbr: string;
  score: number | string | null;
  logo?: string;
  logoFallback?: string;
  /** Country flag image — shown as a badge, not stretched into a circle. */
  flag?: string;
  color?: string;
  alternateColor?: string;
  linescores?: (number | string)[];
  record?: string;
}

export interface BookmarkedTeam {
  id: string;
  sport: string;
  name: string;
  abbr: string;
  logo?: string;
}

export interface BoxScorePlayer {
  id: string;
  name: string;
  position: string;
  number?: string;
  headshot?: string;
  starter: boolean;
  stats: StatItem[];
}

export interface TeamBoxScore {
  team: Team;
  players: BoxScorePlayer[];
  totals: StatItem[];
}

export interface GameBoxScore {
  away: TeamBoxScore;
  home: TeamBoxScore;
  /** `live` = in-game box score; `season` = pre-game season averages preview */
  mode?: 'live' | 'season';
}

export interface PlayEvent {
  id: string;
  period: string;
  clock: string;
  text: string;
  teamAbbr?: string;
  scoringPlay?: boolean;
}

/** MLB Stats API pitch / batted-ball metrics (live game detail). */
export interface PitchMetric {
  id: string;
  inning: number;
  half: 'top' | 'bottom';
  batter?: string;
  pitcher?: string;
  pitchType?: string;
  speed?: number;
  zone?: number;
  x?: number;
  y?: number;
  launchAngle?: number;
  exitVelocity?: number;
  result?: string;
  description?: string;
}

export type SeasonPhase = 'preseason' | 'regular' | 'play-in' | 'playoffs' | 'finals';

export interface GameContext {
  phase: SeasonPhase;
  round?: string;
  gameNumber?: number;
  headline?: string;
  badge?: string;
  seriesSummary?: string;
  seriesLength?: number;
  awaySeriesWins?: number;
  homeSeriesWins?: number;
  awaySeriesRecord?: string;
  homeSeriesRecord?: string;
  isNationalTv?: boolean;
  broadcast?: string;
  elimination?: boolean;
  priority: number;
  oddsSpread?: string;
  oddsTotal?: string;
  oddsBook?: string;
}

export interface LeagueContext {
  seasonYear: number;
  seasonPhase: SeasonPhase;
  seasonLabel?: string;
  isPostseason: boolean;
}

/** Known marquee event types the engine can infer (never 100% — always carries confidence). */
export type SpecialGameKind =
  | 'regular'
  | 'playoff'
  | 'super_bowl'
  | 'world_series'
  | 'nba_finals'
  | 'wnba_finals'
  | 'all_star'
  | 'world_cup'
  | 'euro'
  | 'copa_america'
  | 'champions_league_final'
  | 'europa_league_final'
  | 'fa_cup_final'
  | 'league_cup_final'
  | 'conference_final'
  | 'bowl_game'
  | 'derby'
  | 'rivalry';

export type SpecialGameConfidence = 'high' | 'medium' | 'low';

/** Engine-side special event tagging for future UI (e.g. special game card outline). */
export interface SpecialGameInfo {
  kind: SpecialGameKind;
  label: string;
  confidence: SpecialGameConfidence;
  /** Internal 0–100 score used to derive confidence. */
  score: number;
  /** True when the engine is confident enough to treat this as a marquee game. */
  isSpecial: boolean;
  /** Reserved for UI — set when isSpecial is true. */
  cardVariant?: 'special';
  /** Only populated from human-curated CDN catalog at high confidence. */
  eventLogo?: string;
  /** Where the classification came from. */
  sources: string[];
}

export interface SpecialGameExplanation extends SpecialGameInfo {
  signals: Array<{ id: string; weight: number; detail: string }>;
  matchedCatalogId?: string;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  position: number;
  score: string;
  toPar?: string;
  thru?: string;
  logo?: string;
  country?: string;
  linescores?: (number | string)[];
}

export interface Game {
  id: string;
  sport?: string;
  home: Team;
  away: Team;
  /** Full tournament field for golf events */
  leaderboard?: LeaderboardEntry[];
  tournamentName?: string;
  /** Tennis: hard, clay, grass */
  surface?: string;
  /** Tennis: round label e.g. Quarterfinal; Fights: result method */
  round?: string;
  /** Fights: weight class e.g. Lightweight */
  weightClass?: string;
  status: string;
  statusState?: 'pre' | 'in' | 'post';
  clock: string;
  subtitle?: string;
  topPerformers?: Player[];
  teamStats?: { away: StatItem[]; home: StatItem[] };
  eventLog?: StatItem[];
  boxScore?: GameBoxScore;
  plays?: PlayEvent[];
  pitches?: PitchMetric[];
  venue?: string;
  broadcast?: string;
  attendance?: string;
  context?: GameContext;
  /** Inferred marquee event metadata (all-star, finals, Super Bowl, etc.). */
  special?: SpecialGameInfo;
  timing?: GameTiming;
  /** ESPN soccer league slug (e.g. eng.1, uefa.champions) for detail API routing */
  leagueSlug?: string;
}
