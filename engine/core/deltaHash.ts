import type { Game } from '../../types';
import type { SportType } from '../../services/api';
import { parseEventsForSport, type ParseEventsOptions } from '../../services/parsers/parseGameEvent';
import { isEspnGameEvent as isEspnEvent } from '../../services/parsers/espnParserTypes';

const PRIME32_1 = 2654435761;
const PRIME32_2 = 2246822519;
const PRIME32_3 = 3266489917;
const PRIME32_4 = 668265263;
const PRIME32_5 = 374761393;

const MAX_ENTRIES = 200;

interface ParsedEventCacheEntry {
  hash: number;
  rawLength: number;
  games: Game[];
  cachedAt: number;
}

const cache = new Map<string, ParsedEventCacheEntry>();
const evictionOrder: string[] = [];

let hashGateHits = 0;
let hashGateMisses = 0;
let bypassNext = false;

/** Fast non-cryptographic xxHash32 over a UTF-8 string. */
export function hashRaw(input: string): number {
  const bytes = new TextEncoder().encode(input);
  const len = bytes.length;
  let h32 = (PRIME32_5 + len) >>> 0;
  let i = 0;

  if (len >= 16) {
    const limit = len - 16;
    let v1 = (h32 + PRIME32_1 + PRIME32_2) >>> 0;
    let v2 = (h32 + PRIME32_2) >>> 0;
    let v3 = h32 >>> 0;
    let v4 = (h32 - PRIME32_1) >>> 0;

    while (i <= limit) {
      v1 = round32(v1, read32(bytes, i)); i += 4;
      v2 = round32(v2, read32(bytes, i)); i += 4;
      v3 = round32(v3, read32(bytes, i)); i += 4;
      v4 = round32(v4, read32(bytes, i)); i += 4;
    }

    h32 = (((v1 << 1) | (v1 >>> 31)) + ((v2 << 7) | (v2 >>> 25)) + ((v3 << 12) | (v3 >>> 20)) + ((v4 << 18) | (v4 >>> 14))) >>> 0;
  }

  h32 = (h32 + (len - i)) >>> 0;

  while (i + 4 <= len) {
    h32 = (h32 + (read32(bytes, i) * PRIME32_3)) >>> 0;
    h32 = (((h32 << 17) | (h32 >>> 15)) * PRIME32_4) >>> 0;
    i += 4;
  }

  while (i < len) {
    h32 = (h32 + (bytes[i]! * PRIME32_5)) >>> 0;
    h32 = (((h32 << 11) | (h32 >>> 21)) * PRIME32_1) >>> 0;
    i += 1;
  }

  h32 ^= h32 >>> 15;
  h32 = (h32 * PRIME32_2) >>> 0;
  h32 ^= h32 >>> 13;
  h32 = (h32 * PRIME32_3) >>> 0;
  h32 ^= h32 >>> 16;
  return h32 >>> 0;
}

function read32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]!
    | (bytes[offset + 1]! << 8)
    | (bytes[offset + 2]! << 16)
    | (bytes[offset + 3]! << 24)
  ) >>> 0;
}

function round32(acc: number, input: number): number {
  let v = (acc + (input * PRIME32_2)) >>> 0;
  v = (((v << 13) | (v >>> 19)) * PRIME32_1) >>> 0;
  return v;
}

export function hashEvent(event: unknown): { hash: number; rawLength: number } {
  const json = JSON.stringify(event);
  return { hash: hashRaw(json), rawLength: json.length };
}

function evictIfNeeded(): void {
  while (cache.size > MAX_ENTRIES && evictionOrder.length) {
    const key = evictionOrder.shift();
    if (key) cache.delete(key);
  }
}

function storeCachedEvent(eventId: string, hash: number, rawLength: number, games: Game[]): void {
  const existing = cache.get(eventId);
  if (existing) {
    existing.hash = hash;
    existing.rawLength = rawLength;
    existing.games = games;
    existing.cachedAt = Date.now();
    return;
  }

  cache.set(eventId, { hash, rawLength, games, cachedAt: Date.now() });
  evictionOrder.push(eventId);
  evictIfNeeded();
}

function getCachedEvent(eventId: string, hash: number, rawLength: number): Game[] | null {
  const entry = cache.get(eventId);
  if (!entry) return null;
  if (entry.hash !== hash || entry.rawLength !== rawLength) return null;
  return entry.games;
}

export function requestBypassHashGate(): void {
  bypassNext = true;
}

function consumeBypassHashGate(): boolean {
  if (!bypassNext) return false;
  bypassNext = false;
  return true;
}

export interface HashGateStats {
  hits: number;
  misses: number;
  entries: number;
  cap: number;
}

export function getHashGateStats(): HashGateStats {
  return {
    hits: hashGateHits,
    misses: hashGateMisses,
    entries: cache.size,
    cap: MAX_ENTRIES,
  };
}

export function resetDeltaHashCache(): void {
  cache.clear();
  evictionOrder.length = 0;
  hashGateHits = 0;
  hashGateMisses = 0;
  bypassNext = false;
}

function extractEventId(event: unknown): string | null {
  if (!isEspnEvent(event)) return null;
  const id = event.id;
  if (id === undefined || id === null || id === '') return null;
  return String(id);
}

function cacheParseResults(events: unknown[], games: Game[]): void {
  let idx = 0;
  for (const event of events) {
    const eventId = extractEventId(event);
    if (!eventId) continue;
    const { hash, rawLength } = hashEvent(event);
    const eventGames: Game[] = [];
    while (idx < games.length) {
      const game = games[idx]!;
      const gameId = String(game.id);
      if (eventGames.length && gameId !== eventId && !gameId.startsWith(`${eventId}-`)) break;
      eventGames.push(game);
      idx += 1;
      if (gameId === eventId || gameId.startsWith(`${eventId}-`)) break;
    }
    if (eventGames.length) storeCachedEvent(eventId, hash, rawLength, eventGames);
  }
}

/**
 * Parse ESPN scoreboard events with a per-event raw JSON hash gate.
 * Unchanged events return cached Game objects without re-running the parser.
 */
export function parseEventsWithHashGate(
  events: unknown[],
  sport: SportType,
  options?: ParseEventsOptions,
): Game[] {
  const bypass = consumeBypassHashGate();
  if (bypass) {
    const games = parseEventsForSport(events, sport, options);
    cacheParseResults(events, games);
    return games;
  }

  const games: Game[] = [];

  for (const event of events) {
    const eventId = extractEventId(event);
    if (!eventId) {
      games.push(...parseEventsForSport([event], sport, options));
      continue;
    }

    const { hash, rawLength } = hashEvent(event);
    const cached = getCachedEvent(eventId, hash, rawLength);
    if (cached) {
      games.push(...cached);
      hashGateHits += 1;
      continue;
    }

    hashGateMisses += 1;
    const parsed = parseEventsForSport([event], sport, options);
    storeCachedEvent(eventId, hash, rawLength, parsed);
    games.push(...parsed);
  }

  return games;
}

declare global {
  interface Window {
    __siyfHashGate?: {
      getStats: typeof getHashGateStats;
      reset: typeof resetDeltaHashCache;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__siyfHashGate = {
    getStats: getHashGateStats,
    reset: resetDeltaHashCache,
  };
}
