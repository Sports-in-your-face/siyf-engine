import type { GameContext, LeagueContext, SeasonPhase } from '../../types';
import { isScoreboardNoiseText } from '../../utils/scoreboardNoise';

const PHASE_PRIORITY: Record<SeasonPhase, number> = {
  finals: 1000,
  playoffs: 700,
  'play-in': 500,
  regular: 100,
  preseason: 50,
};

const ROUND_PRIORITY: Record<string, number> = {
  'world series': 100,
  'league championship': 80,
  alcs: 80,
  nlcs: 80,
  'division series': 60,
  alds: 60,
  nlds: 60,
  'wild card': 40,
  'wild-card': 40,
};

function detectPhase(headline: string | undefined, typeAbbr: string | undefined, seasonType?: number): SeasonPhase {
  const h = (headline ?? '').toLowerCase();
  const t = (typeAbbr ?? '').toLowerCase();

  if (h.includes('world series') || t.includes('world series') || t === 'ws') return 'finals';
  if (
    h.includes('wild card') ||
    h.includes('wild-card') ||
    h.includes('division series') ||
    h.includes('league championship') ||
    h.includes('alcs') ||
    h.includes('nlcs') ||
    h.includes('alds') ||
    h.includes('nlds') ||
    h.includes('playoff') ||
    seasonType === 3
  ) return 'playoffs';
  if (seasonType === 1) return 'preseason';
  if (seasonType === 2) return 'regular';
  return seasonType === 3 ? 'playoffs' : 'regular';
}

function detectRound(headline: string | undefined, typeAbbr: string | undefined, typeText?: string): string | undefined {
  const combined = `${headline ?? ''} ${typeAbbr ?? ''} ${typeText ?? ''}`.toLowerCase();
  if (combined.includes('world series') || typeAbbr?.toLowerCase() === 'ws') return 'World Series';
  if (combined.includes('alcs')) return 'ALCS';
  if (combined.includes('nlcs')) return 'NLCS';
  if (combined.includes('alds')) return 'ALDS';
  if (combined.includes('nlds')) return 'NLDS';
  if (combined.includes('league championship')) {
    if (combined.includes('american')) return 'ALCS';
    if (combined.includes('national')) return 'NLCS';
    return 'League Championship';
  }
  if (combined.includes('division series')) {
    if (combined.includes('american')) return 'ALDS';
    if (combined.includes('national')) return 'NLDS';
    return 'Division Series';
  }
  if (combined.includes('wild card') || combined.includes('wild-card')) return 'Wild Card';
  if (headline) return headline.replace(/\s*-\s*.*/i, '').trim() || undefined;
  return typeText;
}

function computePriority(phase: SeasonPhase, round: string | undefined, statusState?: string): number {
  const base = PHASE_PRIORITY[phase] ?? 100;
  const roundKey = (round ?? '').toLowerCase();
  const roundBoost = Object.entries(ROUND_PRIORITY).find(([k]) => roundKey.includes(k))?.[1] ?? 0;
  const liveBoost = statusState === 'in' ? 50 : statusState === 'pre' ? 20 : 0;
  return base + roundBoost + liveBoost;
}

function buildBadge(phase: SeasonPhase, round: string | undefined): string | undefined {
  if (phase === 'finals') return 'WORLD SERIES';
  if (phase === 'playoffs' && round) return round.toUpperCase();
  return undefined;
}

function isPrimetimeBroadcast(broadcast?: string): boolean {
  return Boolean(broadcast && /fox|tbs|espn|abc|mlbn|peacock|prime|fs1|nbc/i.test(broadcast));
}

export function parseBaseballGameContext(
  event: any,
  competition: any,
  _awayAbbr: string,
  _homeAbbr: string,
): GameContext | undefined {
  const seasonType = event?.season?.type ?? competition?.season?.type;
  const notes = competition?.notes ?? event?.competitions?.[0]?.notes ?? [];
  const headline = notes.find((n: any) => n.type === 'event' || n.headline)?.headline
    ?? notes.find((n: any) => n.headline)?.headline;

  const typeAbbr = competition?.type?.abbreviation;
  const typeText = competition?.type?.text ?? competition?.type?.shortName;

  const phase = detectPhase(headline ?? typeText, typeAbbr, seasonType);
  if (phase === 'regular' || phase === 'preseason') return undefined;
  if (phase === 'playoffs' && seasonType !== 3 && !headline && !typeText) return undefined;

  const round = detectRound(headline, typeAbbr, typeText);
  const statusState = competition?.status?.type?.state ?? event?.status?.type?.state;
  const broadcast = competition?.broadcast
    ?? competition?.broadcasts?.find((b: any) => b.market === 'national')?.names?.join(', ')
    ?? competition?.broadcasts?.[0]?.names?.join(', ');

  const badge = buildBadge(phase, round);
  const priority = computePriority(phase, round, statusState);

  return {
    phase,
    round,
    headline: headline ?? round,
    badge,
    isNationalTv: isPrimetimeBroadcast(broadcast),
    broadcast,
    priority,
  };
}

export function parseBaseballContextFromSummary(summary: any, awayAbbr: string, homeAbbr: string): GameContext | undefined {
  const header = summary?.header;
  const comp = header?.competitions?.[0];
  if (!comp) return undefined;
  return parseBaseballGameContext(
    { season: header?.season, name: header?.name, status: comp.status },
    comp,
    awayAbbr,
    homeAbbr,
  );
}

export function sortBaseballGamesByContext<T extends { context?: GameContext; statusState?: string }>(games: T[]): T[] {
  return [...games].sort((a, b) => {
    const pa = a.context?.priority ?? (a.statusState === 'in' ? 200 : a.statusState === 'pre' ? 150 : 50);
    const pb = b.context?.priority ?? (b.statusState === 'in' ? 200 : b.statusState === 'pre' ? 150 : 50);
    return pb - pa;
  });
}

export function applyBaseballContextToSubtitle(context: GameContext | undefined, fallback?: string): string | undefined {
  if (context?.headline && !isScoreboardNoiseText(context.headline)) return context.headline;
  if (context?.badge && !isScoreboardNoiseText(context.badge)) return context.badge;
  if (fallback && !isScoreboardNoiseText(fallback)) return fallback;
  return undefined;
}

export function parseBaseballLeagueContext(scoreboardData: any): LeagueContext {
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
    seasonLabel: league?.season?.displayName ?? season?.displayName,
    isPostseason: typeNum === 3,
  };
}

export function refineBaseballLeaguePhase(league: LeagueContext, games: { context?: GameContext }[]): LeagueContext {
  if (games.some((g) => g.context?.phase === 'finals')) {
    return { ...league, seasonPhase: 'finals' };
  }
  return league;
}

export function mergeBaseballContext(existing: GameContext | undefined, patch: Partial<GameContext>): GameContext | undefined {
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
