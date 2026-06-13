import type { Game, SpecialGameKind } from '../../types';
import { resolveCdnAsset } from '../../config/siyfCdn';
import { classifySpecialGame } from './classifySpecialGame';
import {
  getCuratedSpecialEvents,
  matchCuratedEvent,
  type CuratedSpecialEvent,
  type SpecialEventScheduleType,
} from './specialGameCatalog';

export type SpecialEventPhase = 'upcoming' | 'live' | 'past';

export interface SpecialEventWindow {
  event: CuratedSpecialEvent;
  phase: SpecialEventPhase;
  /** Inclusive active window used for nav + hub visibility. */
  activeFromMs: number;
  activeUntilMs: number;
  /** Core competition window (may be narrower than nav window). */
  coreFromMs: number;
  coreUntilMs: number;
  daysUntilStart: number;
  daysRemaining: number;
  progressRatio: number;
  route: string;
  logoUrl?: string;
}

const MS_DAY = 86_400_000;

const DEFAULT_LEAD_DAYS: Record<SpecialEventScheduleType, number> = {
  single_peak: 10,
  weekend: 4,
  series: 5,
  tournament: 14,
  legacy_range: 7,
};

const DEFAULT_WARMUP: Record<SpecialEventScheduleType, number> = {
  single_peak: 10,
  weekend: 0,
  series: 0,
  tournament: 0,
  legacy_range: 0,
};

const DEFAULT_COOLDOWN: Record<SpecialEventScheduleType, number> = {
  single_peak: 1,
  weekend: 0,
  series: 1,
  tournament: 1,
  legacy_range: 0,
};

/** Parse YYYY-MM-DD at start of UTC day. */
export function parseDateStart(iso: string): number {
  return new Date(`${iso}T00:00:00.000Z`).getTime();
}

/** Parse YYYY-MM-DD at end of UTC day. */
export function parseDateEnd(iso: string): number {
  return new Date(`${iso}T23:59:59.999Z`).getTime();
}

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function diffDays(fromMs: number, toMs: number): number {
  return Math.ceil((toMs - fromMs) / MS_DAY);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function resolveScheduleType(event: CuratedSpecialEvent): SpecialEventScheduleType {
  if (event.schedule?.type) return event.schedule.type;
  if (event.activeFrom || event.activeUntil) return 'legacy_range';
  return 'legacy_range';
}

function resolveCoreWindow(event: CuratedSpecialEvent): { from: string; until: string } {
  const schedule = event.schedule;
  const type = resolveScheduleType(event);

  if (type === 'legacy_range') {
    const from = event.activeFrom ?? event.activeUntil ?? todayIso();
    const until = event.activeUntil ?? event.activeFrom ?? from;
    return { from, until };
  }

  if (type === 'single_peak') {
    const peak = schedule?.peakDate ?? schedule?.startDate ?? event.activeFrom;
    if (!peak) return { from: todayIso(), until: todayIso() };
    return { from: peak, until: peak };
  }

  if (type === 'weekend' || type === 'series' || type === 'tournament') {
    const from = schedule?.startDate ?? event.activeFrom ?? schedule?.endDate ?? todayIso();
    const until = schedule?.endDate ?? event.activeUntil ?? from;
    return { from, until };
  }

  return {
    from: event.activeFrom ?? todayIso(),
    until: event.activeUntil ?? event.activeFrom ?? todayIso(),
  };
}

function resolveActiveWindow(event: CuratedSpecialEvent): { fromMs: number; untilMs: number; coreFromMs: number; coreUntilMs: number } {
  const schedule = event.schedule;
  const type = resolveScheduleType(event);
  const core = resolveCoreWindow(event);
  const coreFromMs = parseDateStart(core.from);
  const coreUntilMs = parseDateEnd(core.until);

  if (type === 'legacy_range') {
    const from = event.activeFrom ?? core.from;
    const until = event.activeUntil ?? core.until;
    return {
      fromMs: parseDateStart(from),
      untilMs: parseDateEnd(until),
      coreFromMs,
      coreUntilMs,
    };
  }

  if (type === 'single_peak') {
    const peak = schedule?.peakDate ?? core.from;
    const warmup = schedule?.warmupDays ?? DEFAULT_WARMUP.single_peak;
    const cooldown = schedule?.cooldownDays ?? DEFAULT_COOLDOWN.single_peak;
    const fromIso = addDays(peak, -warmup);
    const untilIso = addDays(peak, cooldown);
    return {
      fromMs: parseDateStart(fromIso),
      untilMs: parseDateEnd(untilIso),
      coreFromMs: parseDateStart(peak),
      coreUntilMs: parseDateEnd(peak),
    };
  }

  const warmup = schedule?.warmupDays ?? DEFAULT_WARMUP[type];
  const cooldown = schedule?.cooldownDays ?? DEFAULT_COOLDOWN[type];
  const fromIso = warmup > 0 ? addDays(core.from, -warmup) : core.from;
  const untilIso = cooldown > 0 ? addDays(core.until, cooldown) : core.until;

  return {
    fromMs: parseDateStart(fromIso),
    untilMs: parseDateEnd(untilIso),
    coreFromMs,
    coreUntilMs,
  };
}

function todayIso(when = new Date()): string {
  return when.toISOString().slice(0, 10);
}

function eventRoute(event: CuratedSpecialEvent): string {
  const slug = event.nav?.slug ?? event.id.replace(/_/g, '-');
  return `/events/${slug}`;
}

function eventLogoUrl(event: CuratedSpecialEvent): string | undefined {
  if (!event.logo) return undefined;
  return resolveCdnAsset(event.logo) || undefined;
}

export function resolveSpecialEventWindow(
  event: CuratedSpecialEvent,
  when = new Date(),
): SpecialEventWindow {
  const ts = when.getTime();
  const { fromMs, untilMs, coreFromMs, coreUntilMs } = resolveActiveWindow(event);

  let phase: SpecialEventPhase = 'live';
  if (ts < fromMs) phase = 'upcoming';
  else if (ts > untilMs) phase = 'past';

  const daysUntilStart = phase === 'upcoming' ? diffDays(ts, fromMs) : 0;
  const daysRemaining = phase === 'live' ? diffDays(ts, untilMs) : 0;

  const span = Math.max(1, untilMs - fromMs);
  const progressRatio = phase === 'past' ? 1 : phase === 'upcoming' ? 0 : clamp01((ts - fromMs) / span);

  return {
    event,
    phase,
    activeFromMs: fromMs,
    activeUntilMs: untilMs,
    coreFromMs,
    coreUntilMs,
    daysUntilStart,
    daysRemaining,
    progressRatio,
    route: eventRoute(event),
    logoUrl: eventLogoUrl(event),
  };
}

function defaultLeadDays(event: CuratedSpecialEvent): number {
  const type = resolveScheduleType(event);
  return event.nav?.showLeadDays ?? DEFAULT_LEAD_DAYS[type];
}

export function isSpecialEventNavVisible(
  event: CuratedSpecialEvent,
  when = new Date(),
): boolean {
  if (event.enabled === false) return false;
  if (!event.nav?.slug && !event.id) return false;

  const window = resolveSpecialEventWindow(event, when);
  if (window.phase === 'live') return true;
  if (window.phase === 'upcoming' && window.daysUntilStart <= defaultLeadDays(event)) return true;
  return false;
}

export function isSpecialEventHubActive(
  event: CuratedSpecialEvent,
  when = new Date(),
): boolean {
  return isSpecialEventNavVisible(event, when);
}

export function getVisibleSpecialEventNav(when = new Date()): SpecialEventWindow[] {
  return getCuratedSpecialEvents()
    .filter((e) => isSpecialEventNavVisible(e, when))
    .map((e) => resolveSpecialEventWindow(e, when))
    .sort((a, b) => {
      const priA = a.event.nav?.priority ?? 0;
      const priB = b.event.nav?.priority ?? 0;
      if (priA !== priB) return priB - priA;
      if (a.phase === 'live' && b.phase !== 'live') return -1;
      if (b.phase === 'live' && a.phase !== 'live') return 1;
      return a.activeFromMs - b.activeFromMs;
    });
}

export function getNextSpecialEvent(when = new Date()): SpecialEventWindow | null {
  const upcoming = getCuratedSpecialEvents()
    .filter((e) => e.enabled !== false)
    .map((e) => resolveSpecialEventWindow(e, when))
    .filter((w) => w.phase === 'upcoming')
    .sort((a, b) => a.activeFromMs - b.activeFromMs);
  return upcoming[0] ?? null;
}

export function resolveSpecialEventBySlug(
  slug: string,
  when = new Date(),
): SpecialEventWindow | null {
  const normalized = slug.toLowerCase().replace(/^\/+|\/+$/g, '');
  const event = getCuratedSpecialEvents().find((e) => {
    const navSlug = e.nav?.slug?.toLowerCase();
    const idSlug = e.id.replace(/_/g, '-').toLowerCase();
    return navSlug === normalized || idSlug === normalized;
  });
  if (!event || event.enabled === false) return null;
  if (!isSpecialEventHubActive(event, when)) return null;
  return resolveSpecialEventWindow(event, when);
}

function gatherGameText(game: Game): string {
  return [
    game.context?.headline,
    game.context?.round,
    game.context?.badge,
    game.subtitle,
    game.leagueSlug,
    game.status,
    game.away.name,
    game.home.name,
  ]
    .filter(Boolean)
    .join(' · ');
}

const KIND_ALIASES: Partial<Record<SpecialGameKind, SpecialGameKind[]>> = {
  stanley_cup: ['playoff', 'conference_final'],
  nba_finals: ['playoff', 'conference_final'],
  wnba_finals: ['playoff'],
  world_series: ['playoff'],
  super_bowl: ['conference_final', 'playoff'],
};

export function gameMatchesSpecialEvent(
  game: Game,
  event: CuratedSpecialEvent,
  when = new Date(),
): boolean {
  const sportUpper = (game.sport ?? '').toUpperCase();
  if (event.sport && event.sport !== sportUpper) return false;

  const text = gatherGameText(game);
  const curated = matchCuratedEvent(game.sport, text, when);
  if (curated?.id === event.id) return true;

  const haystack = text.toLowerCase();
  if (event.keywords.some((kw) => haystack.includes(kw.toLowerCase()))) return true;

  const classified = classifySpecialGame(game, when);
  if (classified.kind === event.kind) {
    if (classified.isSpecial) return true;
    if (event.kind === 'playoff') return classified.kind === 'playoff';
    const aliases = KIND_ALIASES[event.kind as SpecialGameKind];
    if (aliases?.includes(classified.kind)) return true;
  }

  if (game.context?.phase === 'finals' && event.kind.endsWith('_finals')) return true;
  if (game.context?.phase === 'finals' && event.kind === 'stanley_cup') return true;

  return false;
}

export function filterGamesForSpecialEvent(
  games: Game[],
  event: CuratedSpecialEvent,
  when = new Date(),
): Game[] {
  return games.filter((g) => gameMatchesSpecialEvent(g, event, when));
}

export function formatSpecialEventStatus(window: SpecialEventWindow): string {
  if (window.phase === 'upcoming') {
    if (window.daysUntilStart <= 1) return 'Starts tomorrow';
    return `Starts in ${window.daysUntilStart} days`;
  }
  if (window.phase === 'past') return 'Ended';
  if (window.daysRemaining <= 0) return 'Final day';
  if (window.daysRemaining === 1) return '1 day left';
  return 'Live now';
}
