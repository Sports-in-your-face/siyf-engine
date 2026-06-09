import type { CompetitorLayout } from '../../config/sportProfiles';
import type { EngineSport } from '../sportConfig';

/** What data surfaces this sport actually supports. */
export interface SportFeatures {
  teams: boolean;
  standings: boolean;
  roster: boolean;
  schedule: boolean;
  boxScore: boolean;
  teamStats: boolean;
  plays: boolean;
  eventLog: boolean;
  playerProfile: boolean;
  playerSeasonHistory: boolean;
  supplementalScoreboards: boolean;
  leagueAware: boolean;
}

/** Which pipeline stages to run for this sport. */
export interface SportPipeline {
  rss: boolean;
  odds: boolean;
  fanDuelPerformers: boolean;
  injuryEnrichment: boolean;
  teamNotes: boolean;
  leagueContext: boolean;
  specialClassification: boolean;
  teamLogoEnrichment: boolean;
  enrichMissingContext: boolean;
  scoreboardExtras: boolean;
}

export interface SportApiProfile {
  primary: 'espn';
  espnPath: string;
  secondary: Array<
    | 'balldontlie'
    | 'action-network'
    | 'odds-api'
    | 'rss'
    | 'wnba'
    | 'ncaa'
    | 'supplemental-soccer'
    | 'barttorvik'
    | 'basketball-reference'
    | 'wikidata'
    | 'gleague'
  >;
}

export interface SportCapabilities {
  sport: EngineSport;
  layout: CompetitorLayout;
  /** Prefix used in detail cache keys — busted on live score changes. */
  detailCachePrefix: string;
  features: SportFeatures;
  pipeline: SportPipeline;
  api: SportApiProfile;
  minTeamCount: number;
}

const TEAM_SPORT_FEATURES: SportFeatures = {
  teams: true,
  standings: true,
  roster: true,
  schedule: true,
  boxScore: true,
  teamStats: true,
  plays: true,
  eventLog: true,
  playerProfile: true,
  playerSeasonHistory: true,
  supplementalScoreboards: false,
  leagueAware: false,
};

const INDIVIDUAL_SPORT_FEATURES: SportFeatures = {
  teams: false,
  standings: false,
  roster: false,
  schedule: false,
  boxScore: false,
  teamStats: false,
  plays: false,
  eventLog: false,
  playerProfile: true,
  playerSeasonHistory: false,
  supplementalScoreboards: false,
  leagueAware: false,
};

const ENRICHED_TEAM_PIPELINE: SportPipeline = {
  rss: true,
  odds: true,
  fanDuelPerformers: true,
  injuryEnrichment: true,
  teamNotes: true,
  leagueContext: true,
  specialClassification: true,
  teamLogoEnrichment: true,
  enrichMissingContext: true,
  scoreboardExtras: false,
};

export const SPORT_CAPABILITIES: Record<EngineSport, SportCapabilities> = {
  BASKETBALL: {
    sport: 'BASKETBALL',
    layout: 'team',
    detailCachePrefix: 'detail',
    features: {
      ...TEAM_SPORT_FEATURES,
      supplementalScoreboards: true,
    },
    pipeline: {
      ...ENRICHED_TEAM_PIPELINE,
      scoreboardExtras: true,
    },
    api: {
      primary: 'espn',
      espnPath: 'basketball/nba',
      secondary: ['action-network', 'rss', 'wnba', 'ncaa', 'barttorvik', 'basketball-reference', 'wikidata', 'gleague', 'balldontlie', 'odds-api'],
    },
    minTeamCount: 30,
  },

  FOOTBALL: {
    sport: 'FOOTBALL',
    layout: 'team',
    detailCachePrefix: 'football-detail',
    features: { ...TEAM_SPORT_FEATURES },
    pipeline: { ...ENRICHED_TEAM_PIPELINE },
    api: {
      primary: 'espn',
      espnPath: 'football/nfl',
      secondary: ['action-network', 'rss', 'odds-api'],
    },
    minTeamCount: 32,
  },

  SOCCER: {
    sport: 'SOCCER',
    layout: 'team',
    detailCachePrefix: 'soccer-detail',
    features: {
      ...TEAM_SPORT_FEATURES,
      supplementalScoreboards: true,
      leagueAware: true,
    },
    pipeline: {
      ...ENRICHED_TEAM_PIPELINE,
      scoreboardExtras: true,
    },
    api: {
      primary: 'espn',
      espnPath: 'soccer',
      secondary: ['rss', 'supplemental-soccer', 'odds-api'],
    },
    minTeamCount: 18,
  },

  BASEBALL: {
    sport: 'BASEBALL',
    layout: 'team',
    detailCachePrefix: 'baseball-detail',
    features: { ...TEAM_SPORT_FEATURES },
    pipeline: { ...ENRICHED_TEAM_PIPELINE },
    api: {
      primary: 'espn',
      espnPath: 'baseball/mlb',
      secondary: ['action-network', 'rss', 'odds-api'],
    },
    minTeamCount: 30,
  },

  HOCKEY: {
    sport: 'HOCKEY',
    layout: 'team',
    detailCachePrefix: 'hockey-detail',
    features: { ...TEAM_SPORT_FEATURES },
    pipeline: {
      ...ENRICHED_TEAM_PIPELINE,
    },
    api: {
      primary: 'espn',
      espnPath: 'hockey/nhl',
      secondary: ['action-network', 'rss', 'odds-api'],
    },
    minTeamCount: 30,
  },

  GOLF: {
    sport: 'GOLF',
    layout: 'leaderboard',
    detailCachePrefix: 'golf-detail',
    features: {
      ...INDIVIDUAL_SPORT_FEATURES,
      standings: true,
      teamStats: true,
      playerSeasonHistory: true,
    },
    pipeline: {
      rss: true,
      odds: false,
      fanDuelPerformers: false,
      injuryEnrichment: false,
      teamNotes: false,
      leagueContext: true,
      specialClassification: true,
      teamLogoEnrichment: false,
      enrichMissingContext: true,
      scoreboardExtras: false,
    },
    api: {
      primary: 'espn',
      espnPath: 'golf/pga',
      secondary: ['rss'],
    },
    minTeamCount: 0,
  },

  TENNIS: {
    sport: 'TENNIS',
    layout: 'matchup',
    detailCachePrefix: 'tennis-detail',
    features: {
      ...INDIVIDUAL_SPORT_FEATURES,
      standings: true,
      teamStats: true,
      playerSeasonHistory: true,
    },
    pipeline: {
      rss: true,
      odds: false,
      fanDuelPerformers: false,
      injuryEnrichment: false,
      teamNotes: false,
      leagueContext: true,
      specialClassification: true,
      teamLogoEnrichment: false,
      enrichMissingContext: true,
      scoreboardExtras: false,
    },
    api: {
      primary: 'espn',
      espnPath: 'tennis/atp',
      secondary: ['rss'],
    },
    minTeamCount: 0,
  },

  FIGHTS: {
    sport: 'FIGHTS',
    layout: 'fight',
    detailCachePrefix: 'fights-detail',
    features: INDIVIDUAL_SPORT_FEATURES,
    pipeline: {
      rss: true,
      odds: false,
      fanDuelPerformers: false,
      injuryEnrichment: false,
      teamNotes: false,
      leagueContext: true,
      specialClassification: true,
      teamLogoEnrichment: false,
      enrichMissingContext: false,
      scoreboardExtras: true,
    },
    api: {
      primary: 'espn',
      espnPath: 'mma',
      secondary: ['rss'],
    },
    minTeamCount: 0,
  },
};

/** All detail cache key prefixes — used when busting live game caches. */
export const ALL_DETAIL_CACHE_PREFIXES = [
  ...new Set(Object.values(SPORT_CAPABILITIES).map((c) => c.detailCachePrefix)),
];

export function getSportCapabilities(sport: EngineSport): SportCapabilities {
  return SPORT_CAPABILITIES[sport];
}

export function isTeamLayout(sport: EngineSport): boolean {
  return getSportCapabilities(sport).layout === 'team';
}

export function isIndividualLayout(sport: EngineSport): boolean {
  const layout = getSportCapabilities(sport).layout;
  return layout === 'matchup' || layout === 'leaderboard' || layout === 'fight';
}
