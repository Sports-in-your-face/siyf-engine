import type { Game, GameContext, LeagueContext } from '../../types';

export function parseIndividualLeagueContext(raw: unknown): LeagueContext {
  const data = raw as { leagues?: Array<{ season?: { year?: number } }> };
  const year = data?.leagues?.[0]?.season?.year ?? new Date().getFullYear();
  return {
    seasonYear: year,
    seasonPhase: 'regular',
    isPostseason: false,
  };
}

export function refineIndividualLeaguePhase(ctx: LeagueContext, _games: Game[]): LeagueContext {
  return ctx;
}

export function parseIndividualContextFromSummary(): Partial<GameContext> | null {
  return null;
}

export function mergeIndividualContext(
  existing: GameContext | undefined,
  patch: Partial<GameContext>,
): GameContext | undefined {
  if (!patch || !Object.keys(patch).length) return existing;
  return { ...(existing ?? { priority: 0, phase: 'regular' }), ...patch };
}

export function sortIndividualGamesByContext(games: Game[]): Game[] {
  const priority = (g: Game) => {
    if (g.statusState === 'in') return 0;
    if (g.statusState === 'pre') return 1;
    return 2;
  };
  return [...games].sort((a, b) => priority(a) - priority(b) || a.id.localeCompare(b.id));
}
