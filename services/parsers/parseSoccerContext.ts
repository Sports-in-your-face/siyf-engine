import type { GameContext, LeagueContext, SeasonPhase } from '../../types';
import { coreSoccerLeagueLabel, coreSoccerLeaguePriority, isCoreSoccerLeague } from '../../engine/core/coreSoccerLeagues';
import { leagueLabel } from '../../engine/sources/teamRegistry';

const PHASE_PRIORITY: Record<SeasonPhase, number> = {
  finals: 1000,
  playoffs: 700,
  'play-in': 500,
  regular: 100,
  preseason: 50,
};

const ROUND_PRIORITY: Record<string, number> = {
  'champions league final': 100,
  final: 100,
  semifinal: 80,
  'semi-final': 80,
  quarterfinal: 60,
  'quarter-final': 60,
  'round of 16': 50,
  'round of 32': 40,
  'fa cup final': 90,
  'league cup final': 70,
};

function detectPhase(headline: string | undefined, typeText: string | undefined, leagueSlug?: string, seasonType?: number): SeasonPhase {
  const h = (headline ?? typeText ?? '').toLowerCase();
  const league = (leagueSlug ?? '').toLowerCase();

  if (h.includes('final') && !h.includes('semi')) return 'finals';
  if (
    h.includes('semifinal') ||
    h.includes('semi-final') ||
    h.includes('quarterfinal') ||
    h.includes('quarter-final') ||
    h.includes('round of 16') ||
    h.includes('round of 32') ||
    h.includes('knockout') ||
    league.includes('uefa') ||
    seasonType === 3
  ) return 'playoffs';
  if (seasonType === 1) return 'preseason';
  return 'regular';
}

function detectRound(headline: string | undefined, typeText: string | undefined, leagueSlug?: string): string | undefined {
  const combined = `${headline ?? ''} ${typeText ?? ''}`.toLowerCase();
  if (combined.includes('champions league final') || (combined.includes('final') && leagueSlug?.includes('uefa.champions'))) {
    return 'Champions League Final';
  }
  if (combined.includes('semi')) return 'Semi-Final';
  if (combined.includes('quarter')) return 'Quarter-Final';
  if (combined.includes('round of 16')) return 'Round of 16';
  if (combined.includes('fa cup')) return headline ?? 'FA Cup';
  if (leagueSlug && leagueSlug !== 'eng.1') {
    return coreSoccerLeagueLabel(leagueSlug) ?? leagueLabel(leagueSlug);
  }
  return headline ?? typeText;
}

function computePriority(phase: SeasonPhase, round: string | undefined, leagueSlug: string | undefined, statusState?: string): number {
  const base = PHASE_PRIORITY[phase] ?? 100;
  const roundKey = (round ?? '').toLowerCase();
  const roundBoost = Object.entries(ROUND_PRIORITY).find(([k]) => roundKey.includes(k))?.[1] ?? 0;
  const leagueBoost = isCoreSoccerLeague(leagueSlug)
    ? coreSoccerLeaguePriority(leagueSlug!)
    : leagueSlug === 'uefa.champions'
      ? 200
      : 150;
  const liveBoost = statusState === 'in' ? 50 : statusState === 'pre' ? 20 : 0;
  return base + roundBoost + leagueBoost + liveBoost;
}

function buildBadge(phase: SeasonPhase, round: string | undefined, leagueSlug?: string): string | undefined {
  if (phase === 'finals') return round?.toUpperCase() ?? 'FINAL';
  if (phase === 'playoffs' && round) return round.toUpperCase();
  if (leagueSlug && !isCoreSoccerLeague(leagueSlug)) return leagueLabel(leagueSlug).toUpperCase();
  return undefined;
}

export function parseSoccerGameContext(
  event: any,
  competition: any,
  _awayAbbr: string,
  _homeAbbr: string,
  leagueSlug?: string,
): GameContext | undefined {
  const seasonType = event?.season?.type ?? competition?.season?.type;
  const notes = Array.isArray(competition?.notes) ? competition.notes : [];
  const headline = notes.find((n: any) => n.type === 'event' || n.headline)?.headline
    ?? notes.find((n: any) => n.headline)?.headline;

  const typeText = competition?.type?.text ?? competition?.type?.shortName ?? event?.name;
  const slug = leagueSlug ?? event?.leagues?.[0]?.slug ?? competition?.league?.slug;

  const phase = detectPhase(headline ?? typeText, typeText, slug, seasonType);
  const round = detectRound(headline, typeText, slug);
  const statusState = competition?.status?.type?.state ?? event?.status?.type?.state;
  const broadcasts = competition?.broadcasts;
  const broadcast = competition?.broadcast
    ?? (Array.isArray(broadcasts) ? broadcasts.find((b: any) => b.market === 'national')?.names?.join(', ') : undefined)
    ?? (Array.isArray(broadcasts) ? broadcasts[0]?.names?.join(', ') : undefined);

  const badge = buildBadge(phase, round, slug);
  const priority = computePriority(phase, round, slug, statusState);

  if (phase === 'regular' && isCoreSoccerLeague(slug) && !headline) {
    return {
      phase: 'regular',
      headline: typeText ?? coreSoccerLeagueLabel(slug ?? '') ?? leagueLabel(slug ?? ''),
      badge: slug !== 'eng.1' ? coreSoccerLeagueLabel(slug ?? '')?.toUpperCase() : undefined,
      priority,
      broadcast,
      isNationalTv: Boolean(broadcast),
    };
  }

  if (phase === 'regular' && slug !== 'eng.1' && !isCoreSoccerLeague(slug)) {
    return {
      phase: 'regular',
      badge,
      headline: headline ?? leagueLabel(slug ?? ''),
      priority,
      broadcast,
      isNationalTv: Boolean(broadcast),
    };
  }

  if (phase === 'regular' && !headline) return undefined;

  return {
    phase,
    round,
    headline: headline ?? round,
    badge,
    isNationalTv: Boolean(broadcast && /nbc|peacock|paramount|espn|tnt|usa|fs1|cbc|sky/i.test(broadcast)),
    broadcast,
    priority,
  };
}

export function parseSoccerContextFromSummary(summary: any, awayAbbr: string, homeAbbr: string, leagueSlug?: string): GameContext | undefined {
  const header = summary?.header;
  const comp = header?.competitions?.[0];
  if (!comp) return undefined;
  const slug = leagueSlug ?? header?.leagues?.[0]?.slug ?? comp?.league?.slug;
  return parseSoccerGameContext(
    { season: header?.season, name: header?.name, status: comp.status, leagues: header?.leagues },
    comp,
    awayAbbr,
    homeAbbr,
    slug,
  );
}

export function sortSoccerGamesByContext<T extends { context?: GameContext; statusState?: string; leagueSlug?: string }>(games: T[]): T[] {
  return [...games].sort((a, b) => {
    const pa = a.context?.priority ?? (a.statusState === 'in' ? 200 : a.statusState === 'pre' ? 150 : 50);
    const pb = b.context?.priority ?? (b.statusState === 'in' ? 200 : b.statusState === 'pre' ? 150 : 50);
    if (pb !== pa) return pb - pa;
    return (a.leagueSlug === 'uefa.champions' ? 1 : 0) - (b.leagueSlug === 'uefa.champions' ? 1 : 0);
  });
}

export function applySoccerContextToSubtitle(context: GameContext | undefined, fallback?: string): string | undefined {
  if (context?.headline) return context.headline;
  if (context?.badge) return context.badge;
  return fallback;
}

export function parseSoccerLeagueContext(scoreboardData: any): LeagueContext {
  const league = scoreboardData?.leagues?.[0];
  const season = scoreboardData?.season ?? league?.season;
  const typeId = season?.type?.type ?? season?.type?.id ?? season?.type;
  const typeNum = typeof typeId === 'string' ? parseInt(typeId, 10) : typeId;

  let seasonPhase: SeasonPhase = 'regular';
  if (typeNum === 1) seasonPhase = 'preseason';
  else if (typeNum === 3) seasonPhase = 'playoffs';

  return {
    seasonYear: season?.year ?? new Date().getFullYear(),
    seasonPhase,
    seasonLabel: league?.season?.displayName ?? season?.displayName ?? league?.name,
    isPostseason: typeNum === 3,
  };
}

export function refineSoccerLeaguePhase(league: LeagueContext, games: { context?: GameContext }[]): LeagueContext {
  if (games.some((g) => g.context?.phase === 'finals')) {
    return { ...league, seasonPhase: 'finals' };
  }
  if (games.some((g) => g.context?.phase === 'playoffs')) {
    return { ...league, seasonPhase: 'playoffs', isPostseason: true };
  }
  return league;
}

export function mergeSoccerContext(existing: GameContext | undefined, patch: Partial<GameContext>): GameContext | undefined {
  const hasOdds = patch.oddsSpread != null || patch.oddsTotal != null || patch.oddsBook != null;
  if (!existing && !patch.phase && !patch.headline && !patch.badge && !hasOdds) return undefined;
  if (!existing) {
    return {
      phase: patch.phase ?? 'regular',
      priority: patch.priority ?? 100,
      ...patch,
    };
  }
  return { ...existing, ...patch };
}

export function extractSoccerLeagueSlug(event: any, competition?: any): string {
  return event?.leagues?.[0]?.slug
    ?? competition?.league?.slug
    ?? event?.league?.slug
    ?? 'eng.1';
}
