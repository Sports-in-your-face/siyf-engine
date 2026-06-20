import type { GameContext, LeagueContext, SeasonPhase } from '../../types';
import { isScoreboardNoiseText } from '../../utils/scoreboardNoise';

const GRAND_SLAMS = [
  { pattern: /australian open/i, label: 'Australian Open' },
  { pattern: /roland garros|french open/i, label: 'Roland Garros' },
  { pattern: /wimbledon/i, label: 'Wimbledon' },
  { pattern: /us open/i, label: 'US Open' },
];

const MASTERS = [
  { pattern: /indian wells|bnp paribas/i, label: 'Indian Wells' },
  { pattern: /miami open/i, label: 'Miami Open' },
  { pattern: /monte carlo|monte-carlo/i, label: 'Monte Carlo' },
  { pattern: /madrid open/i, label: 'Madrid Open' },
  { pattern: /italian open|internazionali|rome/i, label: 'Italian Open' },
  { pattern: /canadian open|montreal|toronto|national bank open/i, label: 'Canadian Open' },
  { pattern: /cincinnati/i, label: 'Cincinnati' },
  { pattern: /shanghai/i, label: 'Shanghai Masters' },
  { pattern: /paris masters|bercy|rolex paris/i, label: 'Paris Masters' },
];

const ATP_500 = [
  { pattern: /rotterdam|dubai duty free|barcelona|halle|queen'?s club|washington|beijing|vienna|basel|doha/i, label: 'ATP 500' },
];

const WTA_1000 = [
  { pattern: /qatar open|dubai duty free|indian wells|miami open|madrid open|italian open|canadian open|cincinnati|wuhan|beijing|guangzhou|doha/i, label: 'WTA 1000' },
];

const WTA_500 = [
  { pattern: /st\.? petersburg|charleston|stuttgart|berlin|eastbourne|san jose|tokyo|zhengzhou|tokyo/i, label: 'WTA 500' },
];

function detectTournamentTier(tournamentName?: string, round?: string): { phase: SeasonPhase; round?: string; priority: number } {
  const name = tournamentName ?? '';
  const combined = `${name} ${round ?? ''}`;

  for (const slam of GRAND_SLAMS) {
    if (slam.pattern.test(name)) {
      const isFinal = /final/i.test(round ?? '') && !/semi/i.test(round ?? '');
      return {
        phase: isFinal ? 'finals' : 'playoffs',
        round: `${slam.label}${round ? ` · ${round}` : ''}`,
        priority: isFinal ? 950 : 850,
      };
    }
  }

  for (const masters of MASTERS) {
    if (masters.pattern.test(name)) {
      const isFinal = /final/i.test(round ?? '') && !/semi/i.test(round ?? '');
      return {
        phase: isFinal ? 'finals' as const : 'playoffs' as const,
        round: masters.label,
        priority: isFinal ? 750 : 650,
      };
    }
  }

  for (const tier of [...WTA_1000, ...ATP_500, ...WTA_500]) {
    if (tier.pattern.test(name)) {
      return { phase: 'playoffs' as const, round: tier.label, priority: 520 };
    }
  }

  if (/atp 250|wta 250|atp 500|wta 500|wta 1000|atp 1000/i.test(combined)) {
    return { phase: 'playoffs' as const, round: 'Tour Event', priority: 400 };
  }

  if (/atp finals|wta finals|season.?ending|tour finals/i.test(combined)) {
    return { phase: 'finals', round: 'Tour Finals', priority: 900 };
  }
  if (/davis cup|billie jean king cup|fed cup/i.test(combined)) {
    return { phase: 'playoffs', round: 'Team Event', priority: 600 };
  }
  if (/olympic/i.test(combined)) {
    return { phase: 'finals', round: 'Olympics', priority: 920 };
  }

  if (tournamentName && tournamentName.length > 3) {
    return { phase: 'regular', round: tournamentName, priority: 180 };
  }

  return { phase: 'regular', priority: 100 };
}

function buildBadge(tournamentName?: string, round?: string, surface?: string): string | undefined {
  const slam = GRAND_SLAMS.find((s) => s.pattern.test(tournamentName ?? ''));
  if (slam) {
    if (round && /final/i.test(round) && !/semi/i.test(round)) return `${slam.label.toUpperCase()} FINAL`;
    return slam.label.toUpperCase();
  }
  if (surface && /final/i.test(round ?? '')) return `${surface.toUpperCase()} · FINAL`;
  return undefined;
}

export function parseTennisGameContext(
  tournamentName?: string,
  round?: string,
  surface?: string,
  broadcast?: string,
  statusState?: string,
): GameContext | undefined {
  const tier = detectTournamentTier(tournamentName, round);
  if (!tournamentName && !round && tier.priority <= 100) return undefined;

  const badge = buildBadge(tournamentName, round, surface)
    ?? (tier.round && tier.phase !== 'regular' ? tier.round.toUpperCase().slice(0, 32) : undefined);
  const liveBoost = statusState === 'in' ? 50 : statusState === 'pre' ? 20 : 0;
  const headline = [tournamentName, round].filter(Boolean).join(' · ');

  return {
    phase: tier.phase,
    round: tier.round,
    headline: headline || tournamentName,
    badge,
    isNationalTv: Boolean(broadcast && /espn|tennis channel|prime|abc|bbc|tennis tv/i.test(broadcast)),
    broadcast,
    priority: tier.priority + liveBoost,
  };
}

export function parseTennisLeagueContext(raw: unknown): LeagueContext {
  const data = raw as { leagues?: Array<{ season?: { year?: number } }> };
  const year = data?.leagues?.[0]?.season?.year ?? new Date().getFullYear();
  return {
    seasonYear: year,
    seasonPhase: 'regular',
    isPostseason: false,
  };
}

export function refineTennisLeaguePhase(ctx: LeagueContext, games: { context?: GameContext }[]): LeagueContext {
  if (games.some((g) => g.context?.phase === 'finals')) {
    return { ...ctx, seasonPhase: 'finals' };
  }
  if (games.some((g) => g.context?.phase === 'playoffs')) {
    return { ...ctx, seasonPhase: 'playoffs', isPostseason: true };
  }
  return ctx;
}

export function parseTennisContextFromSummary(summary: any): Partial<GameContext> | null {
  const header = summary?.header ?? summary;
  const comp = header?.competitions?.[0] ?? summary?.competition;
  const tournamentName = header?.name ?? summary?.event?.name;
  const round = comp?.round?.displayName;
  const surface = comp?.surface?.displayName ?? comp?.surface?.abbreviation;
  const broadcast = comp?.broadcasts?.[0]?.names?.join(', ');
  const statusState = comp?.status?.type?.state ?? header?.status?.type?.state;
  const ctx = parseTennisGameContext(tournamentName, round, surface, broadcast, statusState);
  return ctx ?? null;
}

export function mergeTennisContext(
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

export function sortTennisGamesByContext(games: import('../../types').Game[]): import('../../types').Game[] {
  return [...games].sort((a, b) => {
    const pa = a.context?.priority ?? (a.statusState === 'in' ? 200 : a.statusState === 'pre' ? 150 : 50);
    const pb = b.context?.priority ?? (b.statusState === 'in' ? 200 : b.statusState === 'pre' ? 150 : 50);
    if (pb !== pa) return pb - pa;
    return a.id.localeCompare(b.id);
  });
}

export function applyTennisContextToSubtitle(context: GameContext | undefined, fallback?: string): string | undefined {
  if (context?.headline && !isScoreboardNoiseText(context.headline)) return context.headline;
  if (context?.badge && !isScoreboardNoiseText(context.badge)) return context.badge;
  if (fallback && !isScoreboardNoiseText(fallback)) return fallback;
  return undefined;
}
