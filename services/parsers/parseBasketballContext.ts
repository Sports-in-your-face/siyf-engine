import type { GameContext, LeagueContext, SeasonPhase } from '../../types';
import { coerceDisplayString } from '../../utils/coerce';
import { isScoreboardNoiseText } from '../../utils/scoreboardNoise';

const PHASE_PRIORITY: Record<SeasonPhase, number> = {
  finals: 1000,
  playoffs: 700,
  'play-in': 500,
  regular: 100,
  preseason: 50,
};

const ROUND_PRIORITY: Record<string, number> = {
  'nba finals': 100,
  finals: 100,
  'western conference finals': 80,
  'eastern conference finals': 80,
  'conference finals': 80,
  'conf finals': 80,
  'western conference semifinals': 60,
  'eastern conference semifinals': 60,
  'conference semifinals': 60,
  'first round': 40,
  'play-in': 30,
};

function parseGameNumber(text: string): number | undefined {
  const match = text.match(/game\s*(\d+)/i);
  if (!match) return undefined;
  const n = parseInt(match[1], 10);
  return Number.isNaN(n) ? undefined : n;
}

function detectPhase(headline: string | undefined, _typeAbbr: string | undefined, seasonType?: number): SeasonPhase {
  const h = (headline ?? '').toLowerCase();

  // "FINAL" is ESPN's completed-game marker — not the NBA Finals series
  if (h.includes('nba finals')) return 'finals';
  if (h.includes('play-in') || h.includes('play in')) return 'play-in';
  if (
    h.includes('conference finals') ||
    h.includes('conf. finals') ||
    h.includes('first round') ||
    h.includes('semifinal') ||
    h.includes('semi-final') ||
    h.includes('round 1') ||
    seasonType === 3
  ) return 'playoffs';
  if (seasonType === 1) return 'preseason';
  if (seasonType === 2) return 'regular';
  return seasonType === 3 ? 'playoffs' : 'regular';
}

function detectRound(headline: string | undefined, _typeAbbr: string | undefined): string | undefined {
  if (headline) {
    const cleaned = headline.replace(/\s*-\s*game\s*\d+.*/i, '').trim();
    if (cleaned) return cleaned;
  }
  return undefined;
}

function parseSeriesWins(summary: string | undefined, awayAbbr: string, homeAbbr: string) {
  if (!summary) return {};
  const scoreMatch = summary.match(/(\d+)\s*-\s*(\d+)/);
  if (!scoreMatch) return { seriesSummary: summary };

  const w1 = parseInt(scoreMatch[1], 10);
  const w2 = parseInt(scoreMatch[2], 10);
  const lower = summary.toLowerCase();
  const awayLower = awayAbbr.toLowerCase();
  const homeLower = homeAbbr.toLowerCase();

  if (lower.includes(awayLower)) {
    return { awaySeriesWins: w1, homeSeriesWins: w2, seriesSummary: summary };
  }
  if (lower.includes(homeLower)) {
    return { homeSeriesWins: w1, awaySeriesWins: w2, seriesSummary: summary };
  }

  if (lower.includes('leads') || lower.includes('wins')) {
    const leaderMatch = summary.match(/^([A-Za-z\s.]+?)\s+(leads|wins)/i);
    const leader = leaderMatch?.[1]?.trim().toLowerCase() ?? '';
    if (leader.includes(homeLower)) {
      return { homeSeriesWins: w1, awaySeriesWins: w2, seriesSummary: summary };
    }
    if (leader.includes(awayLower)) {
      return { awaySeriesWins: w1, homeSeriesWins: w2, seriesSummary: summary };
    }
    return { homeSeriesWins: w1, awaySeriesWins: w2, seriesSummary: summary };
  }

  return { awaySeriesWins: w1, homeSeriesWins: w2, seriesSummary: summary };
}

function seriesRecordFromCompetitors(competitors: any[]): { away?: string; home?: string } {
  const away = competitors?.find((c: any) => c.homeAway === 'away');
  const home = competitors?.find((c: any) => c.homeAway === 'home');
  const awayRec = away?.records?.find((r: any) => r.type === 'total')?.summary ?? away?.record;
  const homeRec = home?.records?.find((r: any) => r.type === 'total')?.summary ?? home?.record;
  return { away: awayRec, home: homeRec };
}

function computePriority(phase: SeasonPhase, round: string | undefined, gameNumber?: number, statusState?: string): number {
  const base = PHASE_PRIORITY[phase] ?? 100;
  const roundKey = (round ?? '').toLowerCase();
  const roundBoost = Object.entries(ROUND_PRIORITY).find(([k]) => roundKey.includes(k))?.[1] ?? 0;
  const gameBoost = gameNumber ? Math.min(gameNumber, 7) * 5 : 0;
  const liveBoost = statusState === 'in' ? 50 : statusState === 'pre' ? 20 : 0;
  return base + roundBoost + gameBoost + liveBoost;
}

function isEliminationGame(gameNumber: number | undefined, seriesLength: number | undefined, summary?: string): boolean {
  if (!gameNumber || !seriesLength) return false;
  const lower = (summary ?? '').toLowerCase();
  if (lower.includes('elimination') || lower.includes('must win')) return true;
  if (gameNumber >= 7) return true;
  const winsMatch = summary?.match(/(\d+)\s*-\s*(\d+)/);
  if (winsMatch) {
    const max = Math.max(parseInt(winsMatch[1], 10), parseInt(winsMatch[2], 10));
    if (max >= 3 && gameNumber >= 6) return true;
  }
  return false;
}

function buildBadge(phase: SeasonPhase, round: string | undefined, gameNumber?: number): string | undefined {
  if (phase === 'finals') {
    return gameNumber ? `NBA FINALS · GAME ${gameNumber}` : 'NBA FINALS';
  }
  if (phase === 'playoffs' && round) {
    const isFinalsRound = /nba finals|finals/i.test(round);
    if (isFinalsRound) {
      return gameNumber ? `NBA FINALS · GAME ${gameNumber}` : 'NBA FINALS';
    }
    return gameNumber ? `${round.toUpperCase()} · GAME ${gameNumber}` : round.toUpperCase();
  }
  if (phase === 'play-in') return 'PLAY-IN TOURNAMENT';
  return undefined;
}

export function parseGameContext(
  event: any,
  competition: any,
  awayAbbr: string,
  homeAbbr: string,
): GameContext | undefined {
  const seasonType = event?.season?.type ?? competition?.season?.type;
  const notes = competition?.notes ?? event?.competitions?.[0]?.notes ?? [];
  const headlineRaw = notes.find((n: any) => n.type === 'event' || n.headline)?.headline
    ?? notes.find((n: any) => n.headline)?.headline;
  const headline = coerceDisplayString(headlineRaw);

  const typeAbbr = competition?.type?.abbreviation;
  const typeText = competition?.type?.text ?? competition?.type?.shortName;
  const series = competition?.series;

  const phase = detectPhase(headline ?? typeText, typeAbbr, seasonType);
  // Only attach playoff/finals context when ESPN indicates postseason
  if (phase === 'regular' || phase === 'preseason') return undefined;
  if (phase === 'playoffs' && seasonType !== 3 && !headline) return undefined;

  const round = detectRound(headline, typeAbbr);
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
  const elimination = isEliminationGame(gameNumber, seriesLength, seriesSummary);

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
    isNationalTv: Boolean(broadcast && /abc|espn|tnt|nba tv|nbc|prime/i.test(broadcast)),
    broadcast,
    elimination,
    priority,
  };
}

export function parseGameContextFromSummary(summary: any, awayAbbr: string, homeAbbr: string): GameContext | undefined {
  const header = summary?.header;
  const comp = header?.competitions?.[0];
  if (!comp) return undefined;
  return parseGameContext(
    { season: header?.season, name: header?.name, status: comp.status },
    comp,
    awayAbbr,
    homeAbbr,
  );
}

export function sortGamesByContext<T extends { context?: GameContext; statusState?: string }>(games: T[]): T[] {
  return [...games].sort((a, b) => {
    const pa = a.context?.priority ?? (a.statusState === 'in' ? 200 : a.statusState === 'pre' ? 150 : 50);
    const pb = b.context?.priority ?? (b.statusState === 'in' ? 200 : b.statusState === 'pre' ? 150 : 50);
    if (pb !== pa) return pb - pa;
    const ga = a.context?.gameNumber ?? 0;
    const gb = b.context?.gameNumber ?? 0;
    return gb - ga;
  });
}

export function applyContextToSubtitle(context: GameContext | undefined, fallback?: unknown): string | undefined {
  const headline = coerceDisplayString(context?.headline);
  if (headline && !isScoreboardNoiseText(headline)) return headline;
  const badge = coerceDisplayString(context?.badge);
  if (badge && !isScoreboardNoiseText(badge)) return badge;
  const fb = coerceDisplayString(fallback);
  if (fb && !isScoreboardNoiseText(fb)) return fb;
  return undefined;
}

export function parseLeagueContext(scoreboardData: any): LeagueContext {
  const league = scoreboardData?.leagues?.[0];
  const season = scoreboardData?.season ?? league?.season;
  const typeId = season?.type?.type ?? season?.type?.id ?? season?.type;
  const typeNum = typeof typeId === 'string' ? parseInt(typeId, 10) : typeId;

  let seasonPhase: SeasonPhase = 'regular';
  if (typeNum === 1) seasonPhase = 'preseason';
  else if (typeNum === 3) seasonPhase = 'playoffs';
  else if (typeNum === 2) seasonPhase = 'regular';

  return {
    seasonYear: season?.year ?? new Date().getFullYear(),
    seasonPhase,
    seasonLabel: league?.season?.displayName ?? season?.displayName,
    isPostseason: typeNum === 3,
  };
}

export function refineLeaguePhase(league: LeagueContext, games: { context?: GameContext }[]): LeagueContext {
  if (games.some((g) => g.context?.phase === 'finals')) {
    return { ...league, seasonPhase: 'finals' };
  }
  return league;
}

export function mergeContext(existing: GameContext | undefined, patch: Partial<GameContext>): GameContext | undefined {
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
