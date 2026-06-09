import type { Game } from '../../../types';
import { SPORT_ENDPOINTS, type SportType } from '../../../services/api';
import { parseEventsForSport } from '../../../services/parsers/parseGameEvent';
import { parseFightEvents } from '../../../services/parsers/parseFightEvents';
import { parseGolfEvents } from '../../../services/parsers/parseGolfEvents';
import { parseTennisEvents } from '../../../services/parsers/parseTennisEvents';
import { mapActionNetworkGames, type AnScoreboardResponse } from '../../sources/actionNetworkSource';
import { getEspnEvents } from '../../core/espnEventTypes';
import { parseNcaaScoreboardRaw, parseWnbaEspnRaw } from '../../sources/openDataFeeds';
import type { SourceParseResult } from './types';

function countEspnEvents(raw: unknown): unknown[] {
  return getEspnEvents(raw) as unknown[];
}

function countEspnParseUnits(sport: SportType, events: unknown[]): number {
  if (sport === 'TENNIS') {
    let count = 0;
    for (const event of events) {
      const groupings = (event as { groupings?: unknown[] })?.groupings ?? [];
      for (const grouping of groupings) {
        count += ((grouping as { competitions?: unknown[] })?.competitions ?? []).length;
      }
    }
    return count || events.length;
  }
  if (sport === 'FIGHTS') {
    let count = 0;
    for (const event of events) {
      count += ((event as { competitions?: unknown[] })?.competitions ?? []).length;
    }
    return count || events.length;
  }
  return events.length;
}

function isGolfPreScheduledEmpty(raw: unknown): boolean {
  const events = getEspnEvents(raw);
  if (!events.length) return false;
  return events.every((event) => {
    const row = event as {
      status?: { type?: { state?: string } };
      competitions?: Array<{
        status?: { type?: { state?: string } };
        competitors?: unknown[];
      }>;
    };
    const competition = row.competitions?.[0];
    const state = competition?.status?.type?.state ?? row.status?.type?.state;
    const competitors = competition?.competitors;
    return state === 'pre' && (!competitors || competitors.length === 0);
  });
}

export function parseEspnSource(sport: SportType, raw: unknown): SourceParseResult & { scheduledEmpty?: boolean } {
  const events = countEspnEvents(raw);
  if (!events.length) {
    return { games: [], rawCount: 0, skipped: 0 };
  }

  if (sport === 'GOLF' && isGolfPreScheduledEmpty(raw)) {
    return { games: [], rawCount: events.length, skipped: events.length, scheduledEmpty: true };
  }

  let games: Game[];
  switch (sport) {
    case 'TENNIS':
      games = parseTennisEvents(events, 'ATP');
      break;
    case 'GOLF':
      games = parseGolfEvents(events, 'PGA');
      break;
    case 'FIGHTS':
      games = parseFightEvents(events, 'UFC');
      break;
    default:
      games = parseEventsForSport(events, sport);
  }

  const rawCount = countEspnParseUnits(sport, events);
  const skipped = Math.max(0, rawCount - games.length);
  return { games, rawCount, skipped };
}

export function parseActionNetworkSource(league: string, raw: unknown): SourceParseResult {
  const games = mapActionNetworkGames((raw ?? {}) as AnScoreboardResponse, league);
  const rawCount = ((raw as AnScoreboardResponse)?.games ?? []).length;
  return {
    games,
    rawCount,
    skipped: Math.max(0, rawCount - games.length),
  };
}

export function parseWnbaEspnSource(raw: unknown): SourceParseResult {
  const result = parseWnbaEspnRaw(raw);
  return { games: result.games, rawCount: result.rawCount, skipped: result.skipped };
}

export function parseNcaaSource(raw: unknown): SourceParseResult {
  const result = parseNcaaScoreboardRaw(raw);
  return { games: result.games, rawCount: result.rawCount, skipped: result.skipped };
}

export function espnEndpointFor(sport: SportType): string {
  return SPORT_ENDPOINTS[sport];
}
