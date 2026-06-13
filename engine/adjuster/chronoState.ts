import type { Game } from '../../types';
import { classifyStatusSignal, hasActiveClock, statusSignalToChronoState } from './statusClassifier';

export type ChronoState =
  | 'PAST_FINAL'
  | 'FUTURE_SCHEDULED'
  | 'PRESENT_LIVE'
  | 'PRESENT_PAUSED'
  | 'PRESENT_BREAK';

export const CHRONO_POLL_INTERVALS: Record<ChronoState, number> = {
  PAST_FINAL: 30_000,
  FUTURE_SCHEDULED: 30_000,
  PRESENT_LIVE: 12_000,
  PRESENT_PAUSED: 120_000,
  PRESENT_BREAK: 45_000,
};

/** Consecutive pause/break payloads required before throttling down. */
export const ENTER_CONFIRM_COUNT = 2;
export const PENDING_WINDOW_MS = 60_000;

export interface GameChronoRecord {
  gameId: string;
  sport?: string;
  committedState: ChronoState;
  pendingState: ChronoState | null;
  pendingCount: number;
  lastTransitionAt: number;
  lastUpdatedAt: number;
  lastPendingAt: number;
}

export interface ChronoTransition {
  gameId: string;
  sport?: string;
  from: ChronoState;
  to: ChronoState;
  resumed: boolean;
}

type ChronoListener = (snapshot: ChronoDebugSnapshot) => void;

export interface ChronoDebugSnapshot {
  pollIntervalMs: number;
  games: GameChronoRecord[];
  recentTransitions: ChronoTransition[];
}

const records = new Map<string, GameChronoRecord>();
const recentTransitions: ChronoTransition[] = [];
const listeners = new Set<ChronoListener>();
const MAX_TRANSITIONS = 50;

function inferTargetState(game: Game): ChronoState {
  return statusSignalToChronoState(classifyStatusSignal(game));
}

function isThrottleState(state: ChronoState): boolean {
  return state === 'PRESENT_PAUSED' || state === 'PRESENT_BREAK';
}

function isResumeTransition(from: ChronoState, to: ChronoState): boolean {
  return isThrottleState(from) && to === 'PRESENT_LIVE';
}

function shouldSnapToLive(game: Game, target: ChronoState): boolean {
  if (target !== 'PRESENT_LIVE') return false;
  if (hasActiveClock(game)) return true;
  const signal = classifyStatusSignal(game);
  return signal === 'live';
}

function commitState(record: GameChronoRecord, next: ChronoState, now: number): ChronoTransition | null {
  if (record.committedState === next) return null;
  const transition: ChronoTransition = {
    gameId: record.gameId,
    sport: record.sport,
    from: record.committedState,
    to: next,
    resumed: isResumeTransition(record.committedState, next),
  };
  record.committedState = next;
  record.lastTransitionAt = now;
  record.pendingState = null;
  record.pendingCount = 0;
  recentTransitions.push(transition);
  if (recentTransitions.length > MAX_TRANSITIONS) recentTransitions.shift();
  return transition;
}

function initialCommittedState(game: Game): ChronoState {
  if (game.statusState === 'in') return 'PRESENT_LIVE';
  return inferTargetState(game);
}

/** Apply asymmetric hysteresis for one game payload. */
export function updateGameChrono(game: Game): ChronoTransition | null {
  const now = Date.now();
  const gameId = game.id;
  let record = records.get(gameId);

  if (!record) {
    const target = inferTargetState(game);
    record = {
      gameId,
      sport: game.sport,
      committedState: initialCommittedState(game),
      pendingState: isThrottleState(target) ? target : null,
      pendingCount: isThrottleState(target) ? 1 : 0,
      lastTransitionAt: now,
      lastUpdatedAt: now,
      lastPendingAt: now,
    };
    records.set(gameId, record);
    notifyListeners();
    return null;
  }

  record.sport = game.sport ?? record.sport;
  record.lastUpdatedAt = now;

  const target = inferTargetState(game);
  const throttleTarget = isThrottleState(target);

  if (shouldSnapToLive(game, target) && isThrottleState(record.committedState)) {
    const t = commitState(record, 'PRESENT_LIVE', now);
    notifyListeners();
    return t;
  }

  if (!throttleTarget) {
    const t = commitState(record, target, now);
    notifyListeners();
    return t;
  }

  if (record.pendingState === target && now - record.lastPendingAt <= PENDING_WINDOW_MS) {
    record.pendingCount += 1;
  } else {
    record.pendingState = target;
    record.pendingCount = 1;
  }
  record.lastPendingAt = now;

  if (record.pendingCount >= ENTER_CONFIRM_COUNT) {
    const t = commitState(record, target, now);
    notifyListeners();
    return t;
  }

  notifyListeners();
  return null;
}

/** Batch-update chrono records; returns resume transitions for immediate refetch. */
export function updateGamesChrono(games: Game[]): ChronoTransition[] {
  const transitions: ChronoTransition[] = [];
  const activeIds = new Set<string>();

  for (const game of games) {
    activeIds.add(game.id);
    const t = updateGameChrono(game);
    if (t) transitions.push(t);
  }

  for (const id of records.keys()) {
    if (!activeIds.has(id)) records.delete(id);
  }

  return transitions;
}

/** Worst-case (fastest) poll interval across committed game states. */
export function computeChronoPollInterval(games: Game[]): number {
  if (!games.length) return CHRONO_POLL_INTERVALS.FUTURE_SCHEDULED;

  let minInterval = CHRONO_POLL_INTERVALS.FUTURE_SCHEDULED;
  for (const game of games) {
    const record = records.get(game.id);
    const state = record?.committedState ?? inferTargetState(game);
    const interval = CHRONO_POLL_INTERVALS[state];
    if (interval < minInterval) minInterval = interval;
  }
  return minInterval;
}

/** Aggregate poll interval across all tracked sports' last game lists. */
export function computeGlobalChronoPollInterval(gameLists: Game[][]): number {
  const all = gameLists.flat();
  if (!all.length) return CHRONO_POLL_INTERVALS.FUTURE_SCHEDULED;
  return computeChronoPollInterval(all);
}

export function getGameChronoRecord(gameId: string): GameChronoRecord | undefined {
  return records.get(gameId);
}

export function getChronoRecords(): GameChronoRecord[] {
  return [...records.values()];
}

export function getRecentChronoTransitions(): ChronoTransition[] {
  return [...recentTransitions];
}

function buildSnapshot(pollIntervalMs: number): ChronoDebugSnapshot {
  return {
    pollIntervalMs,
    games: getChronoRecords(),
    recentTransitions: getRecentChronoTransitions(),
  };
}

function notifyListeners(): void {
  const snapshot = buildSnapshot(0);
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function subscribeChronoState(listener: ChronoListener): () => void {
  listeners.add(listener);
  listener(buildSnapshot(0));
  return () => listeners.delete(listener);
}

export function resetChronoState(): void {
  records.clear();
  recentTransitions.length = 0;
  listeners.clear();
}

declare global {
  interface Window {
    __siyfChronoState?: {
      get: () => ChronoDebugSnapshot;
      getRecords: typeof getChronoRecords;
      getTransitions: typeof getRecentChronoTransitions;
      subscribe: typeof subscribeChronoState;
      reset: typeof resetChronoState;
      intervals: typeof CHRONO_POLL_INTERVALS;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__siyfChronoState = {
    get: () => buildSnapshot(0),
    getRecords: getChronoRecords,
    getTransitions: getRecentChronoTransitions,
    subscribe: subscribeChronoState,
    reset: resetChronoState,
    intervals: CHRONO_POLL_INTERVALS,
  };
}
