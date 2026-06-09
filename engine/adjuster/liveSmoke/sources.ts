import { ENGINE_SPORTS } from '../../engineSports';
import { SPORT_ENDPOINTS, type SportType } from '../../../services/api';

export interface LiveSmokeSource {
  sport: SportType;
  endpoint: string;
}

/** Live ESPN scoreboard sources — one per engine sport, proxied via SIYF-API. */
export const LIVE_SMOKE_SOURCES: LiveSmokeSource[] = ENGINE_SPORTS.map((sport) => ({
  sport,
  endpoint: SPORT_ENDPOINTS[sport],
}));

export function liveApiBase(): string {
  return (
    process.env.SIYF_API_URL
    ?? process.env.VITE_SIYF_API_URL
    ?? 'https://siyf-api.nic-58f.workers.dev'
  ).replace(/\/$/, '');
}
