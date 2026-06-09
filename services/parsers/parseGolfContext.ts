import type { GameContext, LeagueContext, SeasonPhase } from '../../types';

const MAJORS = [
  { pattern: /masters tournament|the masters/i, label: 'The Masters' },
  { pattern: /pga championship/i, label: 'PGA Championship' },
  { pattern: /u\.?s\.? open/i, label: 'U.S. Open' },
  { pattern: /the open championship|british open/i, label: 'The Open' },
];

const PREMIER_EVENTS = [
  { pattern: /players championship/i, label: 'The Players' },
  { pattern: /fedex|tour championship|bmw championship|travelers championship/i, label: 'FedEx Cup' },
  { pattern: /presidents cup/i, label: 'Presidents Cup' },
  { pattern: /ryder cup/i, label: 'Ryder Cup' },
  { pattern: /solheim cup/i, label: 'Solheim Cup' },
];

function detectTournamentTier(tournamentName?: string): { phase: SeasonPhase; round?: string; priority: number } {
  const name = tournamentName ?? '';

  for (const major of MAJORS) {
    if (major.pattern.test(name)) {
      return { phase: 'finals', round: major.label, priority: 950 };
    }
  }

  for (const event of PREMIER_EVENTS) {
    if (event.pattern.test(name)) {
      const isCup = /cup/i.test(event.label);
      return {
        phase: isCup ? 'finals' : 'playoffs',
        round: event.label,
        priority: isCup ? 900 : 700,
      };
    }
  }

  if (/major|championship/i.test(name) && /lpga|pga/i.test(name)) {
    return { phase: 'playoffs', round: tournamentName, priority: 550 };
  }

  return { phase: 'regular', priority: 100 };
}

function buildBadge(tournamentName?: string): string | undefined {
  for (const major of MAJORS) {
    if (major.pattern.test(tournamentName ?? '')) return major.label.toUpperCase();
  }
  for (const event of PREMIER_EVENTS) {
    if (event.pattern.test(tournamentName ?? '')) return event.label.toUpperCase();
  }
  return undefined;
}

export function parseGolfGameContext(
  tournamentName?: string,
  broadcast?: string,
  statusState?: string,
): GameContext | undefined {
  const tier = detectTournamentTier(tournamentName);
  if (tier.phase === 'regular') return undefined;

  const badge = buildBadge(tournamentName);
  const liveBoost = statusState === 'in' ? 50 : statusState === 'pre' ? 20 : 0;

  return {
    phase: tier.phase,
    round: tier.round,
    headline: tournamentName,
    badge,
    isNationalTv: Boolean(broadcast && /cbs|nbc|golf channel|espn|usa network/i.test(broadcast)),
    broadcast,
    priority: tier.priority + liveBoost,
  };
}

export function parseGolfLeagueContext(raw: unknown): LeagueContext {
  const data = raw as { leagues?: Array<{ season?: { year?: number } }> };
  const year = data?.leagues?.[0]?.season?.year ?? new Date().getFullYear();
  return {
    seasonYear: year,
    seasonPhase: 'regular',
    isPostseason: false,
  };
}

export function refineGolfLeaguePhase(ctx: LeagueContext, games: { context?: GameContext }[]): LeagueContext {
  if (games.some((g) => g.context?.phase === 'finals')) {
    return { ...ctx, seasonPhase: 'finals', isPostseason: true };
  }
  if (games.some((g) => g.context?.phase === 'playoffs')) {
    return { ...ctx, seasonPhase: 'playoffs', isPostseason: true };
  }
  return ctx;
}

export function parseGolfContextFromSummary(summary: any): Partial<GameContext> | null {
  const header = summary?.header ?? summary;
  const name = header?.name ?? header?.shortName;
  const broadcast = header?.broadcasts?.[0]?.names?.join(', ');
  const statusState = header?.competitions?.[0]?.status?.type?.state ?? header?.status?.type?.state;
  const ctx = parseGolfGameContext(name, broadcast, statusState);
  return ctx ?? null;
}

export function mergeGolfContext(
  existing: GameContext | undefined,
  patch: Partial<GameContext>,
): GameContext | undefined {
  if (!patch || !Object.keys(patch).length) return existing;
  if (!existing) {
    return {
      phase: patch.phase ?? 'regular',
      priority: patch.priority ?? 100,
      ...patch,
    };
  }
  const merged = { ...existing, ...patch };
  if ((patch.priority ?? 0) <= (existing.priority ?? 0) && existing.priority) {
    merged.priority = existing.priority;
  }
  return merged;
}

export function sortGolfGamesByContext(games: import('../../types').Game[]): import('../../types').Game[] {
  return [...games].sort((a, b) => {
    const pa = a.context?.priority ?? (a.statusState === 'in' ? 200 : a.statusState === 'pre' ? 150 : 50);
    const pb = b.context?.priority ?? (b.statusState === 'in' ? 200 : b.statusState === 'pre' ? 150 : 50);
    if (pb !== pa) return pb - pa;
    return a.id.localeCompare(b.id);
  });
}
