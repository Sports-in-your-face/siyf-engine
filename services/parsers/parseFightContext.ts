import type { Game, GameContext, LeagueContext } from '../../types';

const ORG_PRIORITY: Record<string, number> = {
  UFC: 700,
  Boxing: 620,
  Bellator: 550,
  PFL: 500,
};

const ORG_SLUG_BY_LABEL: Record<string, string> = {
  UFC: 'ufc',
  Bellator: 'bellator',
  PFL: 'pfl',
  Boxing: 'boxe',
};

/** Resolve ESPN MMA scoreboard slug from a fight game row. */
export function resolveFightOrgSlug(game: Pick<Game, 'sport' | 'leagueSlug'>): string {
  if (game.leagueSlug) return game.leagueSlug;
  return ORG_SLUG_BY_LABEL[game.sport ?? 'UFC'] ?? 'ufc';
}

export function tagUfcGames(games: Game[]): Game[] {
  return games.map((g) => ({
    ...g,
    sport: g.sport ?? 'UFC',
    leagueSlug: g.leagueSlug ?? 'ufc',
    context: g.context ?? {
      phase: 'regular' as const,
      badge: 'UFC',
      headline: g.tournamentName ?? 'UFC',
      priority: ORG_PRIORITY.UFC,
    },
  }));
}

export function parseFightLeagueContext(raw: unknown): LeagueContext {
  const data = raw as { leagues?: Array<{ season?: { year?: number } }> };
  const year = data?.leagues?.[0]?.season?.year ?? new Date().getFullYear();
  return {
    seasonYear: year,
    seasonPhase: 'regular',
    isPostseason: false,
  };
}

export function refineFightLeaguePhase(ctx: LeagueContext, games: Game[]): LeagueContext {
  if (games.some((g) => g.statusState === 'in')) {
    return { ...ctx, seasonPhase: 'playoffs', isPostseason: true };
  }
  return ctx;
}

export function parseFightContextFromSummary(): Partial<GameContext> | null {
  return null;
}

export function mergeFightContext(
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

export function sortFightsGamesByContext(games: Game[]): Game[] {
  return [...games].sort((a, b) => {
    const liveBoost = (g: Game) => {
      if (g.statusState === 'in') return 1000;
      if (g.statusState === 'pre') return 500;
      return 0;
    };
    const pa = (a.context?.priority ?? ORG_PRIORITY[a.sport ?? ''] ?? 100) + liveBoost(a);
    const pb = (b.context?.priority ?? ORG_PRIORITY[b.sport ?? ''] ?? 100) + liveBoost(b);
    if (pb !== pa) return pb - pa;
    return a.id.localeCompare(b.id);
  });
}
