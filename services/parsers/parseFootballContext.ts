import type { GameContext, LeagueContext, SeasonPhase } from '../../types';

const PHASE_PRIORITY: Record<SeasonPhase, number> = {
  finals: 1000,
  playoffs: 700,
  'play-in': 500,
  regular: 100,
  preseason: 50,
};

const ROUND_PRIORITY: Record<string, number> = {
  'super bowl': 100,
  'conference championship': 80,
  'afc championship': 80,
  'nfc championship': 80,
  divisional: 60,
  'wild card': 40,
  'wild-card': 40,
};

function detectPhase(headline: string | undefined, typeAbbr: string | undefined, seasonType?: number): SeasonPhase {
  const h = (headline ?? '').toLowerCase();
  const t = (typeAbbr ?? '').toLowerCase();

  if (h.includes('super bowl') || t.includes('super bowl')) return 'finals';
  if (
    h.includes('wild card') ||
    h.includes('wild-card') ||
    h.includes('divisional') ||
    h.includes('conference championship') ||
    h.includes('playoff') ||
    seasonType === 3
  ) return 'playoffs';
  if (seasonType === 1) return 'preseason';
  if (seasonType === 2) return 'regular';
  return seasonType === 3 ? 'playoffs' : 'regular';
}

function detectRound(headline: string | undefined, typeAbbr: string | undefined, typeText?: string): string | undefined {
  const combined = `${headline ?? ''} ${typeAbbr ?? ''} ${typeText ?? ''}`.toLowerCase();
  if (combined.includes('super bowl')) return 'Super Bowl';
  if (combined.includes('conference championship') || combined.includes('afc championship') || combined.includes('nfc championship')) {
    if (combined.includes('afc')) return 'AFC Championship';
    if (combined.includes('nfc')) return 'NFC Championship';
    return 'Conference Championship';
  }
  if (combined.includes('divisional')) return 'Divisional Round';
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
  if (phase === 'finals') return 'SUPER BOWL';
  if (phase === 'playoffs' && round) return round.toUpperCase();
  return undefined;
}

function isPrimetimeBroadcast(broadcast?: string): boolean {
  return Boolean(broadcast && /nbc|cbs|fox|abc|espn|prime|nfl network|peacock|paramount/i.test(broadcast));
}

export function parseFootballGameContext(
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

export function parseFootballContextFromSummary(summary: any, awayAbbr: string, homeAbbr: string): GameContext | undefined {
  const header = summary?.header;
  const comp = header?.competitions?.[0];
  if (!comp) return undefined;
  return parseFootballGameContext(
    { season: header?.season, name: header?.name, status: comp.status },
    comp,
    awayAbbr,
    homeAbbr,
  );
}

export function sortFootballGamesByContext<T extends { context?: GameContext; statusState?: string }>(games: T[]): T[] {
  return [...games].sort((a, b) => {
    const pa = a.context?.priority ?? (a.statusState === 'in' ? 200 : a.statusState === 'pre' ? 150 : 50);
    const pb = b.context?.priority ?? (b.statusState === 'in' ? 200 : b.statusState === 'pre' ? 150 : 50);
    return pb - pa;
  });
}

export function applyFootballContextToSubtitle(context: GameContext | undefined, fallback?: string): string | undefined {
  if (context?.headline) return context.headline;
  if (context?.badge) return context.badge;
  return fallback;
}

export function parseFootballLeagueContext(scoreboardData: any): LeagueContext {
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

export function refineFootballLeaguePhase(league: LeagueContext, games: { context?: GameContext }[]): LeagueContext {
  if (games.some((g) => g.context?.phase === 'finals')) {
    return { ...league, seasonPhase: 'finals' };
  }
  return league;
}

export function mergeFootballContext(existing: GameContext | undefined, patch: Partial<GameContext>): GameContext | undefined {
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
