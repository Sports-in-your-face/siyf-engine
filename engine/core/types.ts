import type { Game, Player, PlayerDetails, StatItem, Team } from '../../types';

export type DataSource = 'espn' | 'fallback' | (string & {});

export interface ResolvedTeam {
  id: string;
  espnId?: string;
  bdlId?: number;
  name: string;
  abbr: string;
  city: string;
  logo: string;
  color?: string;
  alternateColor?: string;
  conference?: string;
  division?: string;
  note?: string;
  /** ESPN soccer league slug when team belongs to a specific domestic league. */
  leagueSlug?: string;
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

/** MLB Stats API pitch / batted-ball metrics (game detail only). */
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

export interface StandingsRow {
  rank: number;
  team: ResolvedTeam;
  wins: number;
  losses: number;
  /** Win pct for US sports; points total for soccer. */
  winPct: string;
  draws?: number;
  streak?: string;
  gamesBack?: string;
  /** Overtime/shootout losses (NHL) */
  otl?: number;
  /** Draws/ties (soccer) */
  draws?: number;
  /** Goal differential display (soccer), e.g. "+12" */
  goalDiff?: string;
  /** League points (NHL: 2*W + OTL; soccer: table points) */
  points?: number;
}

export interface StandingsGroup {
  name: string;
  rows: StandingsRow[];
}

export interface GameDetail extends Game {
  boxScore?: GameBoxScore;
  plays?: PlayEvent[];
  pitches?: PitchMetric[];
  venue?: string;
  broadcast?: string;
  attendance?: string;
  dataSources: DataSource[];
}

export interface EngineResult<T> {
  data: T;
  sources: DataSource[];
}

export type { Game, Player, PlayerDetails, StatItem, Team };
