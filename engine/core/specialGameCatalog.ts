import { fetchCdnJson } from '../../config/siyfCdn';
import type { SpecialGameKind } from '../../types';
import { resolveSpecialEventWindow } from './specialEventSchedule';

/** How an event occupies the calendar — drives window math and nav lead time. */
export type SpecialEventScheduleType =
  | 'single_peak'
  | 'weekend'
  | 'series'
  | 'tournament'
  | 'legacy_range';

export interface SpecialEventSchedule {
  type: SpecialEventScheduleType;
  startDate?: string;
  endDate?: string;
  peakDate?: string;
  warmupDays?: number;
  cooldownDays?: number;
}

export interface SpecialEventNav {
  slug: string;
  shortLabel?: string;
  showLeadDays?: number;
  priority?: number;
  accent?: string;
}

export interface CuratedSpecialEvent {
  id: string;
  kind: SpecialGameKind;
  sport: 'BASKETBALL' | 'FOOTBALL' | 'SOCCER' | 'BASEBALL' | 'HOCKEY' | string;
  label: string;
  keywords: string[];
  /** @deprecated Prefer schedule.startDate / schedule.endDate */
  activeFrom?: string;
  /** @deprecated Prefer schedule.startDate / schedule.endDate */
  activeUntil?: string;
  schedule?: SpecialEventSchedule;
  nav?: SpecialEventNav;
  logo?: string | null;
  enabled?: boolean;
  notes?: string;
}

interface SpecialEventsCatalog {
  version: number;
  events: CuratedSpecialEvent[];
}

let catalog: CuratedSpecialEvent[] = [];
let loadPromise: Promise<void> | null = null;

/** Engine-side schedule/nav presets — merged over CDN rows until meta v2 is live everywhere. */
const EVENT_PRESETS: Record<string, Partial<CuratedSpecialEvent>> = {
  super_bowl_lx: {
    schedule: { type: 'single_peak', peakDate: '2026-02-08', warmupDays: 14, cooldownDays: 1 },
    nav: { slug: 'super-bowl', shortLabel: 'Super Bowl', showLeadDays: 10, priority: 100, accent: '#e16343' },
  },
  nba_all_star_2026: {
    schedule: { type: 'weekend', startDate: '2026-02-13', endDate: '2026-02-16' },
    nav: { slug: 'nba-all-star', shortLabel: 'All-Star', showLeadDays: 4, priority: 85 },
  },
  nba_finals_2026: {
    schedule: { type: 'series', startDate: '2026-06-04', endDate: '2026-06-22', cooldownDays: 1 },
    nav: { slug: 'nba-finals', shortLabel: 'NBA Finals', showLeadDays: 5, priority: 95 },
  },
  stanley_cup_2026: {
    kind: 'stanley_cup',
    sport: 'HOCKEY',
    label: 'Stanley Cup Final',
    keywords: ['stanley cup', 'stanley cup final', 'cup final'],
    schedule: { type: 'series', startDate: '2026-06-03', endDate: '2026-06-20', cooldownDays: 1 },
    nav: { slug: 'stanley-cup', shortLabel: 'Stanley Cup', showLeadDays: 5, priority: 94 },
    enabled: true,
  },
  world_cup_2026: {
    schedule: { type: 'tournament', startDate: '2026-06-11', endDate: '2026-07-19' },
    nav: { slug: 'world-cup', shortLabel: 'World Cup', showLeadDays: 14, priority: 98 },
    enabled: true,
  },
  world_series_2026: {
    schedule: { type: 'series', startDate: '2026-10-24', endDate: '2026-11-05', cooldownDays: 1 },
    nav: { slug: 'world-series', shortLabel: 'World Series', showLeadDays: 5, priority: 90 },
  },
  mlb_all_star_2026: {
    schedule: { type: 'weekend', startDate: '2026-07-13', endDate: '2026-07-15' },
    nav: { slug: 'mlb-all-star', shortLabel: 'MLB All-Star', showLeadDays: 4, priority: 80 },
  },
};

function mergeEventPreset(event: CuratedSpecialEvent): CuratedSpecialEvent {
  const preset = EVENT_PRESETS[event.id];
  if (!preset) return event;
  return {
    ...event,
    ...preset,
    keywords: preset.keywords ?? event.keywords,
    schedule: event.schedule ?? preset.schedule,
    nav: { ...preset.nav, ...event.nav },
  };
}

function normalizeCatalog(events: CuratedSpecialEvent[]): CuratedSpecialEvent[] {
  const merged = events.map(mergeEventPreset);
  const knownIds = new Set(merged.map((e) => e.id));
  for (const [id, preset] of Object.entries(EVENT_PRESETS)) {
    if (knownIds.has(id)) continue;
    if (!preset.kind || !preset.sport || !preset.label) continue;
    merged.push(mergeEventPreset({
      id,
      kind: preset.kind,
      sport: preset.sport,
      label: preset.label,
      keywords: preset.keywords ?? [],
      enabled: preset.enabled ?? false,
      ...preset,
    } as CuratedSpecialEvent));
  }
  return merged;
}

function isCatalogMatchActive(event: CuratedSpecialEvent, when: Date): boolean {
  if (event.enabled === false) return false;
  const window = resolveSpecialEventWindow(event, when);
  return window.phase === 'live';
}

export async function preloadSpecialEventCatalog(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = fetchCdnJson<SpecialEventsCatalog>('meta/special-events.json')
    .then((data) => {
      catalog = normalizeCatalog(data?.events ?? []);
    })
    .catch(() => {
      catalog = normalizeCatalog([]);
    });
  return loadPromise;
}

export function getCuratedSpecialEvents(): CuratedSpecialEvent[] {
  return catalog;
}

export function matchCuratedEvent(
  sport: string | undefined,
  text: string,
  when = new Date(),
): CuratedSpecialEvent | undefined {
  const haystack = text.toLowerCase();
  const sportUpper = (sport ?? '').toUpperCase();

  for (const event of catalog) {
    if (event.enabled === false) continue;
    if (event.sport && event.sport !== sportUpper) continue;
    if (!isCatalogMatchActive(event, when)) continue;
    if (event.keywords.some((kw) => haystack.includes(kw.toLowerCase()))) {
      return event;
    }
  }
  return undefined;
}
