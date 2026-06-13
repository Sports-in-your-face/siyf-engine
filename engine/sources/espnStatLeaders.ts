export interface StatLeaderEntry {
  name: string;
  team: string;
  teamLogo: string;
  value: string;
}

export interface StatLeaderCategory {
  label: string;
  icon: string;
  leaders: StatLeaderEntry[];
}

interface CategorySpec {
  key: string;
  icon: string;
  label?: string;
}

type LeaderRaw = {
  athlete?: { displayName?: string };
  team?: { abbreviation?: string; logos?: { href?: string }[] };
  displayValue?: string;
  value?: string | number;
};

export function parseEspnStatLeaders(
  data: unknown,
  opts: {
    categories: CategorySpec[];
    teamLogo: (abbr: string) => string;
    formatValue?: (leader: LeaderRaw, categoryKey: string) => string;
  },
): StatLeaderCategory[] | null {
  const categories = (data as { leaders?: { categories?: unknown[] } })?.leaders?.categories ?? [];
  if (!Array.isArray(categories) || !categories.length) return null;

  const mapped: StatLeaderCategory[] = [];

  for (const spec of opts.categories) {
    const cat = categories.find((c: { name?: string }) => c.name === spec.key) as {
      displayName?: string;
      name?: string;
      leaders?: LeaderRaw[];
    } | undefined;
    if (!cat?.leaders?.length) continue;

    mapped.push({
      label: spec.label ?? cat.displayName ?? cat.name ?? spec.key,
      icon: spec.icon,
      leaders: cat.leaders.slice(0, 5).map((l) => {
        const abbr = l.team?.abbreviation ?? '—';
        return {
          name: l.athlete?.displayName ?? '—',
          team: abbr,
          teamLogo: l.team?.logos?.[0]?.href ?? opts.teamLogo(abbr),
          value: opts.formatValue?.(l, spec.key) ?? String(l.displayValue ?? l.value ?? '—'),
        };
      }),
    });
  }

  return mapped.length ? mapped : null;
}
