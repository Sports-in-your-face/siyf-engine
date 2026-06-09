import type { SportType } from '../services/api';

export type CompetitorLayout = 'team' | 'matchup' | 'fight' | 'leaderboard';

export interface TableColumn {
  key: string;
  label: string;
}

export interface SportProfile {
  id: SportType;
  layout: CompetitorLayout;
  /** Back button label on game detail screen */
  detailsHeader: string;
  clockLabel: string;
  scheduledLabel: string;
  finalLabel: string;
  linescoreTitle: string;
  /** Row label in linescore grid (Team, Player, Fighter) */
  linescoreRowLabel: string;
  performersTitle: string;
  teamStatsTitle: string;
  eventLogTitle: string;
  seasonAveragesTitle: string;
  fullStatLineTitle: string;
  splitsTitle: string;
  careerSeasonsTitle: string;
  recentGamesTitle: string;
  showLinescore: boolean;
  showTeamStats: boolean;
  showEventLog: boolean;
  showPerformers: boolean;
  showOdds: boolean;
  showSeries: boolean;
  showBoxScore: boolean;
  showPlayerPhysical: boolean;
  showPlayerCareerTables: boolean;
  supportsPlayerProfile: boolean;
  supportsTeamBookmarks: boolean;
  athletePath?: string;
  leaderStatOrder: string[];
  skipLeaderGroups: string[];
  heroStatLabels: string[];
  boxScoreLiveColumns: readonly string[];
  boxScoreSeasonColumns: readonly string[];
  boxScoreHighlightLive: string;
  boxScoreHighlightSeason: string;
  seasonHistoryColumns: readonly TableColumn[];
  recentGamesColumns: readonly TableColumn[];
  seasonSplitName?: string;
  getPeriodLabel: (index: number, total: number) => string;
  isLiveStatus: (status: string, statusState?: string) => boolean;
}

function quarterLabel(index: number, _total: number): string {
  if (index < 4) return `Q${index + 1}`;
  return `OT${index - 3}`;
}

function periodLabel(index: number): string {
  return `P${index + 1}`;
}

function inningLabel(index: number): string {
  return `${index + 1}`;
}

function halfLabel(index: number): string {
  return index === 0 ? '1H' : '2H';
}

function setLabel(index: number): string {
  return `Set ${index + 1}`;
}

function roundLabel(index: number): string {
  return `R${index + 1}`;
}

function golfRoundLabel(index: number): string {
  return `Rd ${index + 1}`;
}

const LIVE_HINTS = /live|progress|qtr|quarter|half|period|inning|top|bot|round|set|ot|overtime|stoppage|thru/i;

function defaultIsLive(status: string, statusState?: string): boolean {
  if (statusState === 'in') return true;
  return LIVE_HINTS.test(status);
}

export const SPORT_PROFILES: Record<SportType, SportProfile> = {
  BASKETBALL: {
    id: 'BASKETBALL',
    layout: 'team',
    detailsHeader: 'Scores',
    clockLabel: 'Clock',
    scheduledLabel: 'Scheduled',
    finalLabel: 'Final',
    linescoreTitle: 'Quarter Scores',
    linescoreRowLabel: 'Team',
    performersTitle: 'Top Performers',
    teamStatsTitle: 'Team Stats',
    eventLogTitle: 'Plays',
    seasonAveragesTitle: 'Season Averages',
    fullStatLineTitle: 'Full Stat Line',
    splitsTitle: 'Splits',
    careerSeasonsTitle: 'Career Seasons',
    recentGamesTitle: 'Recent Games',
    showLinescore: true,
    showTeamStats: false,
    showEventLog: false,
    showPerformers: true,
    showOdds: true,
    showSeries: true,
    showBoxScore: true,
    showPlayerPhysical: true,
    showPlayerCareerTables: true,
    supportsPlayerProfile: true,
    supportsTeamBookmarks: true,
    athletePath: 'basketball/nba',
    leaderStatOrder: ['PPG', 'RPG', 'APG', 'PTS', 'REB', 'AST', 'STL', 'BLK'],
    skipLeaderGroups: ['rating', 'RAT'],
    heroStatLabels: ['PTS', 'REB', 'AST', 'FG%', '3P%', 'MIN', 'STL', 'BLK'],
    boxScoreLiveColumns: ['MIN', 'PTS', 'REB', 'AST', 'FG', '3PT', 'STL', 'BLK', 'TO', '+/-'],
    boxScoreSeasonColumns: ['MPG', 'PPG', 'RPG', 'APG'],
    boxScoreHighlightLive: 'PTS',
    boxScoreHighlightSeason: 'PPG',
    seasonHistoryColumns: [
      { key: 'gp', label: 'GP' }, { key: 'min', label: 'MIN' }, { key: 'pts', label: 'PTS' },
      { key: 'reb', label: 'REB' }, { key: 'ast', label: 'AST' }, { key: 'fgPct', label: 'FG%' },
      { key: 'fg3Pct', label: '3P%' },
    ],
    recentGamesColumns: [
      { key: 'min', label: 'MIN' }, { key: 'pts', label: 'PTS' },
      { key: 'reb', label: 'REB' }, { key: 'ast', label: 'AST' },
    ],
    seasonSplitName: 'Regular Season',
    getPeriodLabel: quarterLabel,
    isLiveStatus: defaultIsLive,
  },
  FOOTBALL: {
    id: 'FOOTBALL',
    layout: 'team',
    detailsHeader: 'Scores',
    clockLabel: 'Clock',
    scheduledLabel: 'Scheduled',
    finalLabel: 'Final',
    linescoreTitle: 'Quarter Scores',
    linescoreRowLabel: 'Team',
    performersTitle: 'Game Leaders',
    teamStatsTitle: 'Team Stats',
    eventLogTitle: 'Scoring Plays',
    seasonAveragesTitle: 'Season Stats',
    fullStatLineTitle: 'Full Stat Line',
    splitsTitle: 'Splits',
    careerSeasonsTitle: 'Career Seasons',
    recentGamesTitle: 'Recent Games',
    showLinescore: true,
    showTeamStats: true,
    showEventLog: true,
    showPerformers: true,
    showOdds: true,
    showSeries: true,
    showBoxScore: true,
    showPlayerPhysical: true,
    showPlayerCareerTables: true,
    supportsPlayerProfile: true,
    supportsTeamBookmarks: true,
    athletePath: 'football/nfl',
    leaderStatOrder: ['PASS YDS', 'RUSH YDS', 'REC YDS', 'TD', 'SACKS', 'INT', 'FGM', 'FGA'],
    skipLeaderGroups: ['rating', 'RAT'],
    heroStatLabels: ['PASS YDS', 'RUSH YDS', 'REC YDS', 'TD', 'INT', 'QBR'],
    boxScoreLiveColumns: ['YDS', 'TD', 'INT', 'CMP', 'ATT', 'CAR', 'REC', 'SACKS'],
    boxScoreSeasonColumns: ['GP', 'YDS', 'TD', 'INT'],
    boxScoreHighlightLive: 'YDS',
    boxScoreHighlightSeason: 'YDS',
    seasonHistoryColumns: [
      { key: 'gp', label: 'GP' }, { key: 'pts', label: 'TD' }, { key: 'reb', label: 'YDS' },
      { key: 'ast', label: 'INT' },
    ],
    recentGamesColumns: [
      { key: 'pts', label: 'TD' }, { key: 'reb', label: 'YDS' }, { key: 'ast', label: 'INT' },
    ],
    seasonSplitName: 'Regular Season',
    getPeriodLabel: quarterLabel,
    isLiveStatus: defaultIsLive,
  },
  SOCCER: {
    id: 'SOCCER',
    layout: 'team',
    detailsHeader: 'Scores',
    clockLabel: 'Time',
    scheduledLabel: 'Scheduled',
    finalLabel: 'Full Time',
    linescoreTitle: 'Half Scores',
    linescoreRowLabel: 'Team',
    performersTitle: 'Key Players',
    teamStatsTitle: 'Match Stats',
    eventLogTitle: 'Match Events',
    seasonAveragesTitle: 'Season Stats',
    fullStatLineTitle: 'Full Stat Line',
    splitsTitle: 'Splits',
    careerSeasonsTitle: 'Career Seasons',
    recentGamesTitle: 'Recent Matches',
    showLinescore: false,
    showTeamStats: true,
    showEventLog: true,
    showPerformers: true,
    showOdds: true,
    showSeries: false,
    showBoxScore: true,
    showPlayerPhysical: true,
    showPlayerCareerTables: true,
    supportsPlayerProfile: true,
    supportsTeamBookmarks: true,
    athletePath: 'soccer/eng.1',
    leaderStatOrder: ['G', 'A', 'SH', 'ST', 'FC', 'YC', 'RC'],
    skipLeaderGroups: ['rating', 'RAT'],
    heroStatLabels: ['G', 'A', 'SH', 'ST', 'FC', 'GP'],
    boxScoreLiveColumns: ['G', 'A', 'SH', 'ST', 'FC', 'YC', 'MIN'],
    boxScoreSeasonColumns: ['GP', 'G', 'A', 'SH'],
    boxScoreHighlightLive: 'G',
    boxScoreHighlightSeason: 'G',
    seasonHistoryColumns: [
      { key: 'gp', label: 'GP' }, { key: 'pts', label: 'G' }, { key: 'reb', label: 'A' },
      { key: 'ast', label: 'SH' },
    ],
    recentGamesColumns: [
      { key: 'pts', label: 'G' }, { key: 'reb', label: 'A' }, { key: 'ast', label: 'SH' },
    ],
    seasonSplitName: 'Regular Season',
    getPeriodLabel: halfLabel,
    isLiveStatus: defaultIsLive,
  },
  BASEBALL: {
    id: 'BASEBALL',
    layout: 'team',
    detailsHeader: 'Scores',
    clockLabel: 'Inning',
    scheduledLabel: 'Scheduled',
    finalLabel: 'Final',
    linescoreTitle: 'Line Score',
    linescoreRowLabel: 'Team',
    performersTitle: 'Batting Leaders',
    teamStatsTitle: 'Team Stats',
    eventLogTitle: 'Scoring Plays',
    seasonAveragesTitle: 'Season Stats',
    fullStatLineTitle: 'Full Stat Line',
    splitsTitle: 'Splits',
    careerSeasonsTitle: 'Career Seasons',
    recentGamesTitle: 'Recent Games',
    showLinescore: true,
    showTeamStats: true,
    showEventLog: true,
    showPerformers: true,
    showOdds: true,
    showSeries: true,
    showBoxScore: true,
    showPlayerPhysical: true,
    showPlayerCareerTables: true,
    supportsPlayerProfile: true,
    supportsTeamBookmarks: true,
    athletePath: 'baseball/mlb',
    leaderStatOrder: ['AVG', 'HR', 'RBI', 'R', 'H', 'SB', 'ERA', 'W', 'SO', 'SV'],
    skipLeaderGroups: ['rating', 'RAT'],
    heroStatLabels: ['AVG', 'HR', 'RBI', 'R', 'H', 'ERA', 'W', 'SO'],
    boxScoreLiveColumns: ['AB', 'R', 'H', 'RBI', 'BB', 'SO', 'HR', 'IP', 'ER'],
    boxScoreSeasonColumns: ['AVG', 'HR', 'RBI', 'ERA', 'W', 'SO'],
    boxScoreHighlightLive: 'H',
    boxScoreHighlightSeason: 'AVG',
    seasonHistoryColumns: [
      { key: 'gp', label: 'GP' }, { key: 'pts', label: 'AVG' }, { key: 'reb', label: 'HR' },
      { key: 'ast', label: 'RBI' }, { key: 'fgPct', label: 'ERA' },
    ],
    recentGamesColumns: [
      { key: 'pts', label: 'H' }, { key: 'reb', label: 'RBI' }, { key: 'ast', label: 'R' },
    ],
    seasonSplitName: 'Regular Season',
    getPeriodLabel: inningLabel,
    isLiveStatus: defaultIsLive,
  },
  HOCKEY: {
    id: 'HOCKEY',
    layout: 'team',
    detailsHeader: 'Scores',
    clockLabel: 'Clock',
    scheduledLabel: 'Scheduled',
    finalLabel: 'Final',
    linescoreTitle: 'Period Scores',
    linescoreRowLabel: 'Team',
    performersTitle: 'Game Leaders',
    teamStatsTitle: 'Team Stats',
    eventLogTitle: 'Scoring Plays',
    seasonAveragesTitle: 'Season Stats',
    fullStatLineTitle: 'Full Stat Line',
    splitsTitle: 'Splits',
    careerSeasonsTitle: 'Career Seasons',
    recentGamesTitle: 'Recent Games',
    showLinescore: true,
    showTeamStats: true,
    showEventLog: true,
    showPerformers: true,
    showOdds: true,
    showSeries: true,
    showBoxScore: true,
    showPlayerPhysical: true,
    showPlayerCareerTables: true,
    supportsPlayerProfile: true,
    supportsTeamBookmarks: true,
    athletePath: 'hockey/nhl',
    leaderStatOrder: ['G', 'A', 'PTS', 'SOG', 'SV%', 'GA', 'SA'],
    skipLeaderGroups: ['rating', 'RAT'],
    heroStatLabels: ['G', 'A', 'PTS', 'SOG', 'SV%', 'GP'],
    boxScoreLiveColumns: ['G', 'A', 'PTS', 'SOG', '+/-', 'TOI', 'SV%', 'SA'],
    boxScoreSeasonColumns: ['GP', 'G', 'A', 'PTS'],
    boxScoreHighlightLive: 'PTS',
    boxScoreHighlightSeason: 'PTS',
    seasonHistoryColumns: [
      { key: 'gp', label: 'GP' }, { key: 'pts', label: 'PTS' }, { key: 'reb', label: 'G' },
      { key: 'ast', label: 'A' }, { key: 'fgPct', label: 'SV%' },
    ],
    recentGamesColumns: [
      { key: 'pts', label: 'PTS' }, { key: 'reb', label: 'G' }, { key: 'ast', label: 'A' },
    ],
    getPeriodLabel: periodLabel,
    isLiveStatus: defaultIsLive,
  },
  GOLF: {
    id: 'GOLF',
    layout: 'leaderboard',
    detailsHeader: 'Leaderboard',
    clockLabel: 'Round',
    scheduledLabel: 'Scheduled',
    finalLabel: 'Final',
    linescoreTitle: 'Round Scores',
    linescoreRowLabel: 'Player',
    performersTitle: 'Leaders',
    teamStatsTitle: 'Tournament Stats',
    eventLogTitle: 'Highlights',
    seasonAveragesTitle: 'Season Stats',
    fullStatLineTitle: 'Full Stat Line',
    splitsTitle: 'Splits',
    careerSeasonsTitle: 'Career',
    recentGamesTitle: 'Recent Events',
    showLinescore: false,
    showTeamStats: true,
    showEventLog: false,
    showPerformers: true,
    showOdds: false,
    showSeries: false,
    showBoxScore: false,
    showPlayerPhysical: false,
    showPlayerCareerTables: true,
    supportsPlayerProfile: true,
    supportsTeamBookmarks: false,
    athletePath: 'golf/pga',
    leaderStatOrder: ['POS', 'TOT', 'TO PAR', 'THRU', 'R1', 'R2', 'R3', 'R4'],
    skipLeaderGroups: ['rating', 'RAT'],
    heroStatLabels: ['POS', 'TOT', 'TO PAR', 'THRU'],
    boxScoreLiveColumns: [],
    boxScoreSeasonColumns: [],
    boxScoreHighlightLive: 'TOT',
    boxScoreHighlightSeason: 'TOT',
    seasonHistoryColumns: [
      { key: 'gp', label: 'Events' }, { key: 'pts', label: 'Rank' }, { key: 'ast', label: 'Wins' },
      { key: 'reb', label: 'Top 10' }, { key: 'fgPct', label: 'Avg' },
    ],
    recentGamesColumns: [
      { key: 'pts', label: 'POS' }, { key: 'reb', label: 'Score' }, { key: 'ast', label: 'To Par' },
    ],
    getPeriodLabel: golfRoundLabel,
    isLiveStatus: defaultIsLive,
  },
  TENNIS: {
    id: 'TENNIS',
    layout: 'matchup',
    detailsHeader: 'Match',
    clockLabel: 'Set',
    scheduledLabel: 'Scheduled',
    finalLabel: 'Final',
    linescoreTitle: 'Set Scores',
    linescoreRowLabel: 'Player',
    performersTitle: 'Match Leaders',
    teamStatsTitle: 'Match Stats',
    eventLogTitle: 'Point Log',
    seasonAveragesTitle: 'Season Stats',
    fullStatLineTitle: 'Full Stat Line',
    splitsTitle: 'Splits',
    careerSeasonsTitle: 'Career',
    recentGamesTitle: 'Recent Matches',
    showLinescore: true,
    showTeamStats: true,
    showEventLog: false,
    showPerformers: true,
    showOdds: false,
    showSeries: false,
    showBoxScore: false,
    showPlayerPhysical: false,
    showPlayerCareerTables: true,
    supportsPlayerProfile: true,
    supportsTeamBookmarks: false,
    athletePath: 'tennis/atp',
    leaderStatOrder: ['Aces', 'DF', '1st Serve %', 'BP Won', 'Winners', 'UE'],
    skipLeaderGroups: ['rating', 'RAT'],
    heroStatLabels: ['Rank', 'Aces', 'DF', '1st Serve %'],
    boxScoreLiveColumns: [],
    boxScoreSeasonColumns: [],
    boxScoreHighlightLive: 'Aces',
    boxScoreHighlightSeason: 'Aces',
    seasonHistoryColumns: [
      { key: 'gp', label: 'Events' }, { key: 'pts', label: 'W' }, { key: 'reb', label: 'L' },
      { key: 'ast', label: 'Titles' }, { key: 'stl', label: 'Rank' },
    ],
    recentGamesColumns: [
      { key: 'pts', label: 'Result' }, { key: 'reb', label: 'Opponent' }, { key: 'ast', label: 'Tournament' },
    ],
    getPeriodLabel: setLabel,
    isLiveStatus: defaultIsLive,
  },
  FIGHTS: {
    id: 'FIGHTS',
    layout: 'fight',
    detailsHeader: 'Fights',
    clockLabel: 'Round',
    scheduledLabel: 'Scheduled',
    finalLabel: 'Final',
    linescoreTitle: 'Round Scores',
    linescoreRowLabel: 'Fighter',
    performersTitle: 'Fighters',
    teamStatsTitle: 'Fight Stats',
    eventLogTitle: 'Fight Timeline',
    seasonAveragesTitle: 'Record',
    fullStatLineTitle: 'Fight Stats',
    splitsTitle: 'Splits',
    careerSeasonsTitle: 'Fight History',
    recentGamesTitle: 'Recent Fights',
    showLinescore: false,
    showTeamStats: false,
    showEventLog: true,
    showPerformers: true,
    showOdds: false,
    showSeries: false,
    showBoxScore: false,
    showPlayerPhysical: true,
    showPlayerCareerTables: false,
    supportsPlayerProfile: true,
    supportsTeamBookmarks: false,
    athletePath: 'mma',
    leaderStatOrder: ['W', 'L', 'D', 'KO', 'SUB', 'DEC'],
    skipLeaderGroups: ['rating', 'RAT'],
    heroStatLabels: ['W', 'L', 'D'],
    boxScoreLiveColumns: [],
    boxScoreSeasonColumns: [],
    boxScoreHighlightLive: 'W',
    boxScoreHighlightSeason: 'W',
    seasonHistoryColumns: [],
    recentGamesColumns: [],
    getPeriodLabel: roundLabel,
    isLiveStatus: defaultIsLive,
  },
};

export function getSportProfile(sport: SportType): SportProfile {
  return SPORT_PROFILES[sport];
}

export function getBookmarkableSports(sports: SportType[]): SportType[] {
  return sports.filter((s) => SPORT_PROFILES[s].supportsTeamBookmarks);
}

export function pickOrderedStats(
  stats: { label: string; value: string | number }[],
  order: string[],
): { label: string; value: string | number }[] {
  const sorted = [...stats].sort(
    (a, b) => order.indexOf(a.label) - order.indexOf(b.label),
  );
  const known = sorted.filter((s) => order.includes(s.label));
  const rest = sorted.filter((s) => !order.includes(s.label));
  return [...known, ...rest];
}
