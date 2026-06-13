/** Flatten ESPN roster payloads — handles flat lists and position-grouped `items[]` schema. */
export function flattenEspnRosterEntries(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== 'object') return [];
  const root = data as Record<string, unknown>;
  const raw = (root.athletes ?? (root.team as Record<string, unknown>)?.athletes) as unknown[];
  if (!Array.isArray(raw) || !raw.length) return [];

  if (raw[0] && typeof raw[0] === 'object' && Array.isArray((raw[0] as Record<string, unknown>).items)) {
    return raw.flatMap((group) => {
      const items = (group as Record<string, unknown>).items;
      return Array.isArray(items) ? items : [];
    }) as Record<string, unknown>[];
  }

  return raw.map((entry) => {
    if (entry && typeof entry === 'object' && (entry as Record<string, unknown>).athlete) {
      return (entry as Record<string, unknown>).athlete as Record<string, unknown>;
    }
    return entry as Record<string, unknown>;
  });
}

export function mapEspnRosterEntry(athlete: Record<string, unknown>) {
  const position = athlete.position as Record<string, unknown> | string | undefined;
  const headshot = athlete.headshot as Record<string, unknown> | string | undefined;
  return {
    id: String(athlete.id ?? ''),
    name: String(athlete.displayName ?? athlete.fullName ?? 'Unknown'),
    position:
      (typeof position === 'object' ? position?.abbreviation ?? position?.name : position) ?? '—',
    number: athlete.jersey as string | undefined,
    headshot: typeof headshot === 'object' ? headshot?.href : headshot,
  };
}

export function parseEspnRosterEntries(data: unknown) {
  return flattenEspnRosterEntries(data)
    .filter((a) => a.id)
    .map(mapEspnRosterEntry);
}
