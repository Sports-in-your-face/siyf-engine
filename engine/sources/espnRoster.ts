import type { StatItem } from '../core/types';

export interface ParsedRosterEntry {
  id: string;
  name: string;
  position: string;
  number?: string;
  headshot?: string;
  height?: string;
  weight?: string;
  age?: string;
  injuryStatus?: string;
  stats: StatItem[];
}

/** ESPN roster payloads group athletes by position with an `items` array. */
export function flattenEspnRosterAthletes(data: unknown): unknown[] {
  if (!data || typeof data !== 'object') return [];
  const root = data as Record<string, unknown>;
  const groups = (root.athletes ?? (root.team as Record<string, unknown> | undefined)?.athletes ?? root.roster) as unknown;
  if (!Array.isArray(groups)) return [];

  const flat: unknown[] = [];
  for (const entry of groups) {
    if (!entry || typeof entry !== 'object') continue;
    const group = entry as Record<string, unknown>;
    const items = group.items;
    if (Array.isArray(items) && items.length) {
      const groupPosition =
        (group.position as { abbreviation?: string; name?: string } | string | undefined);
      const posLabel = typeof groupPosition === 'string'
        ? groupPosition
        : groupPosition?.abbreviation ?? groupPosition?.name ?? (group.name as string | undefined);
      for (const item of items) {
        if (item && typeof item === 'object') {
          flat.push({ ...(item as object), _groupPosition: posLabel });
        }
      }
      continue;
    }
    if (group.athlete || group.id || group.displayName) {
      flat.push(entry);
    }
  }
  return flat;
}

function readInjuryStatus(athlete: Record<string, unknown>): string | undefined {
  const injuries = athlete.injuries;
  if (Array.isArray(injuries) && injuries.length) {
    const first = injuries[0] as { status?: string; type?: string; details?: string } | undefined;
    const status = first?.status ?? first?.type ?? first?.details;
    if (status) return String(status);
  }
  const injury = athlete.injury as { status?: string } | undefined;
  if (injury?.status) return String(injury.status);
  const status = athlete.injuryStatus ?? athlete.status;
  if (typeof status === 'string' && /out|injur|doubt|question|susp|ir|pup|day-to-day/i.test(status)) {
    return status;
  }
  return undefined;
}

function parseInlineRosterStats(entry: Record<string, unknown>): StatItem[] {
  const stats: StatItem[] = [];
  const statistics = entry.statistics ?? entry.stats;
  if (Array.isArray(statistics)) {
    for (const row of statistics) {
      if (!row || typeof row !== 'object') continue;
      const stat = row as { name?: string; abbreviation?: string; displayValue?: string | number; value?: string | number };
      const label = stat.abbreviation ?? stat.name;
      const value = stat.displayValue ?? stat.value;
      if (label && value != null && String(value) !== '') {
        stats.push({ label: String(label), value: String(value) });
      }
    }
  }
  const splits = (entry.statistics as { splits?: Array<{ stats?: (string | number)[]; labels?: string[] }> } | undefined)?.splits;
  if (Array.isArray(splits) && splits[0]?.stats?.length) {
    const labels = splits[0].labels ?? [];
    for (let i = 0; i < labels.length; i++) {
      const value = splits[0].stats?.[i];
      if (value != null && String(value) !== '') {
        stats.push({ label: String(labels[i]), value: String(value) });
      }
    }
  }
  return stats;
}

export function parseEspnRosterEntry(entry: unknown): ParsedRosterEntry | null {
  if (!entry || typeof entry !== 'object') return null;
  const raw = entry as Record<string, unknown>;
  const athlete = (raw.athlete ?? raw) as Record<string, unknown>;
  const id = athlete.id ?? raw.id;
  const name = athlete.displayName ?? athlete.fullName ?? athlete.shortName ?? raw.displayName;
  if (!id || !name) return null;

  const groupPosition = raw._groupPosition as string | undefined;
  const positionObj = athlete.position as { abbreviation?: string; name?: string } | undefined;

  return {
    id: String(id),
    name: String(name),
    position: positionObj?.abbreviation ?? positionObj?.name ?? groupPosition ?? '—',
    number: athlete.jersey != null ? String(athlete.jersey) : undefined,
    headshot: (athlete.headshot as { href?: string } | undefined)?.href
      ?? (typeof athlete.headshot === 'string' ? athlete.headshot : undefined),
    height: typeof athlete.displayHeight === 'string' ? athlete.displayHeight : undefined,
    weight: typeof athlete.displayWeight === 'string' ? athlete.displayWeight : undefined,
    age: athlete.age != null ? String(athlete.age) : undefined,
    injuryStatus: readInjuryStatus(athlete),
    stats: parseInlineRosterStats(raw),
  };
}

export function parseEspnRosterResponse(data: unknown): ParsedRosterEntry[] {
  return flattenEspnRosterAthletes(data)
    .map((entry) => parseEspnRosterEntry(entry))
    .filter((player): player is ParsedRosterEntry => Boolean(player));
}
