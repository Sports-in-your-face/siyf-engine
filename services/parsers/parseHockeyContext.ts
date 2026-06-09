import type { GameContext, LeagueContext, SeasonPhase } from '../../types';

const PHASE_PRIORITY: Record<SeasonPhase, number> = {
  finals: 1000,
  playoffs: 700,
  'play-in': 500,
  regular: 100,
  preseason: 50,
};

const ROUND_PRIORITY: Record<string, number> = {
  'stanley cup': 100,
  'stanley cup final': 100,
  'conference final': 80,
  'conference finals': 80,
  semifinal: 70,
  'second round': 60,
  'first round': 40,
};

function detectPhase(headline: string | undefined, _typeAbbr: string | undefined, seasonType?: number): SeasonPhase {
  const h = (headline ?? '').toLowerCase();

  if (h.includes('stanley cup final') || (h.includes('stanley cup') && h.includes('game'))) return 'finals';
  if (
    h.includes('stanley cup') ||
    h.includes('conference final') ||
    h.includes('semifinal') ||
    h.includes('second round') ||
    h.includes('first round') ||
    h.includes('playoff') ||
    seasonType === 3
  ) return 'playoffs';
  if (seasonType === 1) return 'preseason';
  return seasonType === 3 ? 'playoffs' : 'regular';
}

function detectRound(headline: string | undefined, typeAbbr: string | undefined, typeText?: string): string | undefined {
  const combined = `${headline ?? ''} ${typeAbbr ?? ''} ${typeText ?? ''}`.toLowerCase();
  if (combined.includes('stanley cup final')) return 'Stanley Cup Final';
  if (combined.includes('stanley cup')) return 'Stanley Cup Playoffs';
  if (combined.includes('conference final')) {
    if (combined.includes('eastern')) return 'Eastern Conference Final';
    if (combined.includes('western')) return 'Western Conference Final';
    return 'Conference Final';
  }
  if (combined.includes('semifinal')) return 'Conference Semifinal';
  if (combined.includes('second round')) return 'Second Round';
  if (combined.includes('first round')) return 'First Round';
  if (headline) return headline.replace(/\s*-\s*.*/i, '').trim() || undefined;
  return typeText;
}

function parseGameNumber(headline: string): number | undefined {
  const match = headline.match(/game\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : undefined;
}

function parseSeriesWins(
  summary: string | undefined,
  awayAbbr: string,
  homeAbbr: string,
): { awaySeriesWins?: number; homeSeriesWins?: number } {
  if (!summary) return {};
  const match = summary.match(/(\w+)\s+(\d+)\s*[-–]\s*(\d+)\s+(\w+)/i);
  if (!match) return {};
  const [, team1, wins1, wins2, team2] = match;
  const w1 = parseInt(wins1, 10);
  const w2 = parseInt(wins2, 10);
  if (team1.toUpperCase() === awayAbbr.toUpperCase()) return { awaySeriesWins: w1, homeSeriesWins: w2 };
  if (team2.toUpperCase() === awayAbbr.toUpperCase()) return { awaySeriesWins: w2, homeSeriesWins: w1 };
  if (team1.toUpperCase() === homeAbbr.toUpperCase()) return { homeSeriesWins: w1, awaySeriesWins: w2 };
  if (team2.toUpperCase() === homeAbbr.toUpperCase()) return { homeSeriesWins: w2, awaySeriesWins: w1 };
  return {};
}

function computePriority(phase: SeasonPhase, round: string | undefined, gameNumber?: number, statusState?: string): number {
  const base = PHASE_PRIORITY[phase] ?? 100;
  const roundKey = (round ?? '').toLowerCase();
  const roundBoost = Object.entries(ROUND_PRIORITY).find(([k]) => roundKey.includes(k))?.[1] ?? 0;
  const gameBoost = gameNumber ? Math.min(gameNumber * 5, 25) : 0;
  const liveBoost = statusState === 'in' ? 50 : statusState === 'pre' ? 20 : 0;
  return base + roundBoost + gameBoost + liveBoost;
}

function buildBadge(phase: SeasonPhase, round: string | undefined, gameNumber?: number): string | undefined {
  if (phase === 'finals') return gameNumber ? `STANLEY CUP · GAME ${gameNumber}` : 'STANLEY CUP FINAL';
  if (phase === 'playoffs' && round) return round.toUpperCase();
  return undefined;
}

function isNationalBroadcast(broadcast?: string): boolean {
  return Boolean(broadcast && /abc|espn|tnt|nbc|prime|nhl network|max|hbo/i.test(broadcast));
}

function seriesRecordFromCompetitors(competitors: any[]): { away?: string; home?: string } {
  const away = competitors?.find((c: any) => c.homeAway === 'away');
  const home = competitors?.find((c: any) => c.homeAway === 'home');
  const awayRec = away?.records?.find((r: any) => r.type === 'total')?.summary ?? away?.record;
  const homeRec = home?.records?.find((r: any) => r.type === 'total')?.summary ?? home?.record;
  return { away: awayRec, home: homeRec };
}

export function parseHockeyGameContext(
  event: any,
  competition: any,
  awayAbbr: string,
  homeAbbr: string,
): GameContext | undefined {
  const seasonType = event?.season?.type ?? competition?.season?.type;
  const notes = competition?.notes ?? event?.competitions?.[0]?.notes ?? [];
  const headline = notes.find((n: any) => n.type === 'event' || n.headline)?.headline
    ?? notes.find((n: any) => n.headline)?.headline;

  const typeAbbr = competition?.type?.abbreviation;
  const typeText = competition?.type?.text ?? competition?.type?.shortName;
  const series = competition?.series;

  const phase = detectPhase(headline ?? typeText, typeAbbr, seasonType);
  if (phase === 'regular' || phase === 'preseason') return undefined;
  if (phase === 'playoffs' && seasonType !== 3 && !headline && !typeText) return undefined;

  const round = detectRound(headline, typeAbbr, typeText);
  const gameNumber = parseGameNumber(headline ?? '') ?? parseGameNumber(event?.name ?? '');
  const seriesSummary = series?.summary as string | undefined;
  const seriesLength = series?.totalCompetitions as number | undefined;
  const seriesWins = parseSeriesWins(seriesSummary, awayAbbr, homeAbbr);
  const seriesRecords = seriesRecordFromCompetitors(competition?.competitors ?? []);
  const statusState = competition?.status?.type?.state ?? event?.status?.type?.state;
  const broadcast = competition?.broadcast
    ?? competition?.broadcasts?.find((b: any) => b.market === 'national')?.names?.join(', ')
    ?? competition?.broadcasts?.[0]?.names?.join(', ');

  const badge = buildBadge(phase, round, gameNumber);
  const priority = computePriority(phase, round, gameNumber, statusState);

  return {
    phase,
    round,
    gameNumber,
    headline: headline ?? (round && gameNumber ? `${round} - Game ${gameNumber}` : round),
    badge,
    seriesSummary,
    seriesLength,
    awaySeriesWins: seriesWins.awaySeriesWins,
    homeSeriesWins: seriesWins.homeSeriesWins,
    awaySeriesRecord: seriesRecords.away,
    homeSeriesRecord: seriesRecords.home,
    isNationalTv: isNationalBroadcast(broadcast),
    broadcast,
    priority,
  };
}

export function parseHockeyContextFromSummary(summary: any, awayAbbr: string, homeAbbr: string): GameContext | undefined {
  const header = summary?.header;
  const comp = header?.competitions?.[0];
  if (!comp) return undefined;
  return parseHockeyGameContext(
    { season: header?.season, name: header?.name, status: comp.status },
    comp,
    awayAbbr,
    homeAbbr,
  );
}

export function sortHockeyGamesByContext<T extends { context?: GameContext; statusState?: string }>(games: T[]): T[] {
  return [...games].sort((a, b) => {
    const pa = a.context?.priority ?? (a.statusState === 'in' ? 200 : a.statusState === 'pre' ? 150 : 50);
    const pb = b.context?.priority ?? (b.statusState === 'in' ? 200 : b.statusState === 'pre' ? 150 : 50);
    return pb - pa;
  });
}

export function applyHockeyContextToSubtitle(context: GameContext | undefined, fallback?: string): string | undefined {
  if (context?.headline) return context.headline;
  if (context?.badge) return context.badge;
  return fallback;
}

export function parseHockeyLeagueContext(scoreboardData: any): LeagueContext {
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

export function refineHockeyLeaguePhase(league: LeagueContext, games: { context?: GameContext }[]): LeagueContext {
  if (games.some((g) => g.context?.phase === 'finals')) {
    return { ...league, seasonPhase: 'finals', isPostseason: true };
  }
  if (games.some((g) => g.context?.phase === 'playoffs')) {
    return { ...league, seasonPhase: 'playoffs', isPostseason: true };
  }
  return league;
}

export function mergeHockeyContext(existing: GameContext | undefined, patch: Partial<GameContext>): GameContext | undefined {
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
