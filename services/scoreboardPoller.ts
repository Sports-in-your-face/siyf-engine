import type { Game } from '../types';
import { gamesSnapshotEqual } from '../utils/gameSnapshot';
import { fetchGames, type SportType } from './api';

type ScoreboardListener = (games: Game[]) => void;

interface SportState {
  listeners: Set<ScoreboardListener>;
  lastGames: Game[];
  inflight: Promise<Game[]> | null;
}

const sportStates = new Map<SportType, SportState>();
const activeSports = new Set<SportType>();

let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollIntervalMs = 30_000;
let paused = false;

function getState(sport: SportType): SportState {
  let state = sportStates.get(sport);
  if (!state) {
    state = { listeners: new Set(), lastGames: [], inflight: null };
    sportStates.set(sport, state);
  }
  return state;
}

function hasLiveGames(games: Game[]): boolean {
  return games.some((g) => g.statusState === 'in');
}

function computePollInterval(): number {
  for (const sport of activeSports) {
    const state = sportStates.get(sport);
    if (state?.lastGames.length && hasLiveGames(state.lastGames)) {
      return 12_000;
    }
  }
  return 30_000;
}

function notifyListeners(sport: SportType, games: Game[], force = false): void {
  const state = getState(sport);
  if (!force && gamesSnapshotEqual(state.lastGames, games)) return;
  state.lastGames = games;
  for (const listener of state.listeners) {
    listener(games);
  }
}

/** Fetch one sport's scoreboard; dedupes concurrent callers. */
export function fetchScoreboardOnce(sport: SportType): Promise<Game[]> {
  const state = getState(sport);
  if (state.inflight) return state.inflight;

  state.inflight = fetchGames(sport)
    .then((games) => {
      // Always notify after a fetch completes so empty scoreboards exit "Syncing scores".
      notifyListeners(sport, games, true);
      return games;
    })
    .finally(() => {
      state.inflight = null;
    });

  return state.inflight;
}

function restartPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  if (activeSports.size === 0 || paused) return;
  pollIntervalMs = computePollInterval();
  pollTimer = setInterval(() => {
    void pollAll();
  }, pollIntervalMs);
}

function ensurePolling(): void {
  if (typeof document !== 'undefined' && !document.__siyfVisibilityBound) {
    document.__siyfVisibilityBound = true;
    document.addEventListener('visibilitychange', () => {
      paused = document.visibilityState === 'hidden';
      if (paused) {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
      } else {
        void pollAll();
        restartPolling();
      }
    });
  }
  if (!pollTimer && activeSports.size > 0 && !paused) {
    restartPolling();
  }
}

async function pollAll(): Promise<void> {
  if (paused || activeSports.size === 0) return;
  await Promise.all([...activeSports].map((sport) => fetchScoreboardOnce(sport)));
  const nextInterval = computePollInterval();
  if (nextInterval !== pollIntervalMs) restartPolling();
}

/** Drop cached games and refetch when scoreboard inputs change (e.g. soccer league filter). */
export function bumpScoreboard(sport: SportType): void {
  const state = getState(sport);
  state.lastGames = [];
  if (state.listeners.size > 0) {
    void fetchScoreboardOnce(sport);
  }
}

/**
 * Subscribe to scoreboard updates for a sport.
 * Shares one poll loop across App, BookmarkBar, and other consumers.
 */
export function subscribeScoreboard(
  sport: SportType,
  listener: ScoreboardListener,
): () => void {
  const state = getState(sport);
  state.listeners.add(listener);
  activeSports.add(sport);
  ensurePolling();

  if (state.lastGames.length) {
    listener(state.lastGames);
  } else {
    void fetchScoreboardOnce(sport);
  }

  return () => {
    state.listeners.delete(listener);
    if (state.listeners.size === 0) {
      activeSports.delete(sport);
    }
    if (activeSports.size === 0 && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}

/** Read last cached games for a sport without triggering fetch. */
export function getCachedScoreboard(sport: SportType): Game[] {
  return getState(sport).lastGames;
}

export function resetScoreboardPoller(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  sportStates.clear();
  activeSports.clear();
  paused = false;
  pollIntervalMs = 30_000;
}

declare global {
  interface Document {
    __siyfVisibilityBound?: boolean;
  }
}
