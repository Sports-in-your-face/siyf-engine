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

export interface StandingsRow {
  rank: number;
  team: ResolvedTeam;
  wins: number;
  losses: number;
  winPct: string;
  streak?: string;
  gamesBack?: string;
}

export interface StandingsGroup {
  name: string;
  rows: StandingsRow[];
}

export interface GameDetail extends Game {
  boxScore?: GameBoxScore;
  plays?: PlayEvent[];
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
