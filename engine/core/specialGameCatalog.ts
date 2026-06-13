import { fetchCdnJson } from '../../config/siyfCdn';
import type { SpecialGameKind } from '../../types';

export interface CuratedSpecialEvent {
  id: string;
  kind: SpecialGameKind;
  sport: 'BASKETBALL' | 'FOOTBALL' | 'SOCCER' | string;
  label: string;
  keywords: string[];
  activeFrom?: string;
  activeUntil?: string;
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

function isActive(event: CuratedSpecialEvent, when: Date): boolean {
  if (event.enabled === false) return false;
  const ts = when.getTime();
  if (event.activeFrom) {
    const from = new Date(`${event.activeFrom}T00:00:00`).getTime();
    if (ts < from) return false;
  }
  if (event.activeUntil) {
    const until = new Date(`${event.activeUntil}T23:59:59`).getTime();
    if (ts > until) return false;
  }
  return true;
}

export async function preloadSpecialEventCatalog(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = fetchCdnJson<SpecialEventsCatalog>('meta/special-events.json')
    .then((data) => {
      catalog = data?.events ?? [];
    })
    .catch(() => {
      catalog = [];
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
    if (!isActive(event, when)) continue;
    if (event.keywords.some((kw) => haystack.includes(kw.toLowerCase()))) {
      return event;
    }
  }
  return undefined;
}
