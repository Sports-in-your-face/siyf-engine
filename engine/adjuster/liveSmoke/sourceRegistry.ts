import { ENGINE_SPORTS } from '../../engineSports';
import { SPORT_ENDPOINTS, type SportType } from '../../../services/api';
import type { EngineSport } from '../../sportConfig';
import type { MergeSmokeDefinition, SourceSmokeDefinition } from './types';

const ESPN_WNBA = '/api/espn/apis/site/v2/sports/basketball/wnba/scoreboard';

/** Ring 3 ESPN scoreboards — one per engine sport. */
export const ESPN_SMOKE_SOURCES: SourceSmokeDefinition[] = ENGINE_SPORTS.map((sport) => ({
  id: `espn-${sport.toLowerCase()}`,
  kind: 'espn',
  sport,
  label: `ESPN ${sport}`,
  endpoint: SPORT_ENDPOINTS[sport],
  allowEmpty: sport === 'GOLF' || sport === 'TENNIS' || sport === 'FIGHTS',
  allowScheduledEmpty: sport === 'GOLF',
}));

/** Action Network scoreboards — US big-4 team sports. */
export const ACTION_NETWORK_SMOKE_SOURCES: SourceSmokeDefinition[] = ([
  { league: 'nba', sport: 'BASKETBALL' },
  { league: 'nfl', sport: 'FOOTBALL' },
  { league: 'mlb', sport: 'BASEBALL' },
  { league: 'nhl', sport: 'HOCKEY' },
] as const).map(({ league, sport }) => ({
  id: `action-network-${league}`,
  kind: 'action-network',
  sport,
  label: `Action Network ${league.toUpperCase()}`,
  endpoint: `/api/action-network/scoreboard/${league}`,
  allowEmpty: false,
}));

/** Supplemental open-data feeds merged into basketball scoreboard. */
export const SUPPLEMENTAL_SMOKE_SOURCES: SourceSmokeDefinition[] = [
  {
    id: 'wnba-espn',
    kind: 'supplemental',
    sport: 'WNBA',
    label: 'WNBA ESPN',
    endpoint: ESPN_WNBA,
    allowEmpty: true,
  },
  {
    id: 'ncaa-scoreboard',
    kind: 'supplemental',
    sport: 'NCAA',
    label: 'NCAA D1 Men',
    endpoint: '/api/fetch?url=ncaa-scoreboard',
    allowEmpty: true,
  },
];

/** ESPN + Action Network merge simulations per team sport. */
export const MERGE_SMOKE_DEFINITIONS: MergeSmokeDefinition[] = ACTION_NETWORK_SMOKE_SOURCES.map((src) => ({
  id: `merge-${src.id.replace('action-network-', 'espn-an-')}`,
  sport: src.sport as EngineSport,
  label: `ESPN + AN ${src.sport}`,
  espnEndpoint: SPORT_ENDPOINTS[src.sport as SportType],
  anLeague: src.endpoint.split('/').pop()!,
}));

/** Aggregate supplemental bundles (multi-league / multi-org). */
export const AGGREGATE_SMOKE_SOURCES = [
  { id: 'supplemental-soccer', sport: 'SOCCER', label: 'Soccer supplemental leagues' },
  { id: 'supplemental-fights', sport: 'FIGHTS', label: 'Fight supplemental orgs' },
] as const;

export const ALL_SOURCE_SMOKE_IDS = [
  ...ESPN_SMOKE_SOURCES,
  ...ACTION_NETWORK_SMOKE_SOURCES,
  ...SUPPLEMENTAL_SMOKE_SOURCES,
].map((s) => s.id);

export function getNcaaLiveEndpoint(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const path = `https://data.ncaa.com/casablanca/scoreboard/basketball-mens-d1/${y}/${m}/${d}/scoreboard.json`;
  return `/api/fetch?url=${encodeURIComponent(path)}`;
}
