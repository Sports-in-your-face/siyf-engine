import { engineLogError, engineLogInfo, engineLogWarn } from '../../config/engineLog';
import { EspnGameLogSchema, EspnPlayerDetailsSchema, EspnSeasonStatisticsSchema } from '../sources/espnSchemas';
import { getSportProfile, getPlayerProfileForLeague } from '../../config/sportProfiles';
import { coerceDisplayString } from '../../utils/coerce';
import { getTeamAccent } from '../../utils/teamColors';
import { refreshAllGameTimings, refreshGameTiming } from '../../utils/gameTime';
import type { ResolvedTeam } from './types';
import type { EngineSport } from '../sportConfig';
import type { GameBoxScore } from './types';
import type {
  Game,
  Player,
  PlayerAward,
  PlayerDetails,
  PlayerGameLogRow,
  PlayerSeasonRow,
  PlayerStatSplit,
  StatItem,
} from '../../types';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function createEngineLog(engineName: string) {
  return (level: LogLevel, method: string, msg: string, meta?: unknown): void => {
    const tag = `[${engineName}][${method}]`;
    if (level === 'debug') return;
    if (level === 'info') engineLogInfo(tag, msg, meta ?? '');
    else if (level === 'warn') engineLogWarn(tag, msg, meta ?? '');
    else if (level === 'error') engineLogError(tag, msg, meta ?? '');
  };
}

type EngineLog = ReturnType<typeof createEngineLog>;

/** Run a sync step; log and return fallback on failure instead of throwing. */
export function safeTrySync<T>(
  log: EngineLog | undefined,
  method: string,
  label: string,
  fn: () => T,
  fallback: T,
): T {
  try {
    return fn();
  } catch (err) {
    log?.('warn', method, `${label} failed`, err);
    return fallback;
  }
}

/** Run an async step; log and return fallback on failure instead of throwing. */
export async function safeTryAsync<T>(
  log: EngineLog | undefined,
  method: string,
  label: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    log?.('warn', method, `${label} failed`, err);
    return fallback;
  }
}

export type FetchResult<T> = { success: true; data: T } | { success: false; error: Error };

export function createSafeFetch(log: ReturnType<typeof createEngineLog>) {
  return async function safeFetch<T>(label: string, fn: () => Promise<T>): Promise<FetchResult<T>> {
    try {
      return { success: true, data: await fn() };
    } catch (err) {
      log('warn', label, 'call failed', err);
      return { success: false, error: err instanceof Error ? err : new Error(String(err)) };
    }
  };
}

export function safeRefreshTimings<
  T extends { statusState?: 'pre' | 'in' | 'post'; clock: string; timing?: import('../../utils/gameTime').GameTiming },
>(games: T[], log?: ReturnType<typeof createEngineLog>): T[] {
  try {
    return refreshAllGameTimings(games);
  } catch (err) {
    log?.('warn', 'safeRefreshTimings', 'timing refresh failed', err);
    return games;
  }
}

export function mergeTeamsByAbbr(primary: ResolvedTeam[], secondary: ResolvedTeam[]): ResolvedTeam[] {
  const map = new Map(primary.map((t) => [t.abbr, t]));
  for (const t of secondary) {
    if (!t?.abbr) continue;
    if (!map.has(t.abbr)) map.set(t.abbr, t);
    else {
      const existing = map.get(t.abbr)!;
      map.set(t.abbr, { ...existing, ...t, logo: existing.logo || t.logo });
    }
  }
  return Array.from(map.values()).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
}

export function mapStatRow(labels: string[], values: string[]): StatItem[] {
  if (!Array.isArray(labels) || !Array.isArray(values)) return [];
  return labels.map((label, i) => ({ label, value: values[i] ?? '—' }));
}

export function pickHeroStats(stats: StatItem[], order: string[]): StatItem[] {
  if (!stats.length) return [];
  const picked = order.map((l) => stats.find((s) => s.label === l)).filter(Boolean) as StatItem[];
  return picked.length ? picked : stats.slice(0, 6);
}

export interface PlayerStatIndices {
  gp: number;
  min: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fgPct: number;
  fg3Pct: number;
  ftPct: number;
  to: number;
}

export type LabelIndexFn = (labels: string[]) => PlayerStatIndices;

const LIVE_STAT_LABELS: Record<EngineSport, string[]> = {
  BASKETBALL: ['MIN'],
  FOOTBALL: ['MIN', 'SNAP'],
  SOCCER: ['MIN', 'MP'],
  BASEBALL: ['AB', 'IP', 'PA', 'BF'],
  HOCKEY: ['TOI', 'MIN'],
  GOLF: [],
  TENNIS: [],
  FIGHTS: [],
};

/** True when at least one player has logged playing time in this box score. */
export function boxScoreHasLiveStats(boxScore: GameBoxScore, sport: EngineSport): boolean {
  const labels = LIVE_STAT_LABELS[sport];
  if (!labels.length) return false;

  const players = [...boxScore.away.players, ...boxScore.home.players];
  return players.some((p) =>
    labels.some((label) => {
      const val = p.stats.find((s) => s.label.toUpperCase() === label)?.value;
      if (!val || val === '—' || val === '0') return false;
      const parsed = parseFloat(String(val));
      return !Number.isNaN(parsed) && parsed > 0;
    }),
  );
}

export const BASKETBALL_LABEL_INDEX: LabelIndexFn = (labels) => {
  const i = (label: string) => labels.indexOf(label);
  return {
    gp: i('GP'), min: i('MIN'), pts: i('PTS'), reb: i('REB'), ast: i('AST'),
    stl: i('STL'), blk: i('BLK'), fgPct: i('FG%'), fg3Pct: i('3P%'), ftPct: i('FT%'), to: i('TO'),
  };
};

export const HOCKEY_LABEL_INDEX: LabelIndexFn = (labels) => {
  const i = (label: string) => labels.indexOf(label);
  return {
    gp: i('GP'), min: i('TOI'), pts: i('PTS'), reb: i('-'), ast: i('A'),
    stl: i('-'), blk: i('BLK'), fgPct: i('-'), fg3Pct: i('-'), ftPct: i('SV%'), to: i('-'),
  };
};

export const FOOTBALL_LABEL_INDEX: LabelIndexFn = (labels) => {
  const i = (label: string) => labels.indexOf(label);
  return {
    gp: i('GP'), min: i('MIN'),
    pts: i('YDS') >= 0 ? i('YDS') : i('PASS YDS'),
    reb: i('TD'), ast: i('INT'), stl: i('CMP'), blk: i('ATT'),
    fgPct: i('QBR'), fg3Pct: i('RTG'), ftPct: i('SACKS'), to: i('FUM'),
  };
};

export const SOCCER_LABEL_INDEX: LabelIndexFn = (labels) => {
  const i = (label: string) => labels.indexOf(label);
  return {
    gp: i('GP'), min: i('MIN'),
    pts: i('G') >= 0 ? i('G') : i('GL'),
    reb: i('A') >= 0 ? i('A') : i('AST'),
    ast: i('SH'), stl: i('ST'), blk: i('FC'),
    fgPct: i('SH%'), fg3Pct: i('SOG'), ftPct: i('PK'), to: i('YC'),
  };
};

export const BASEBALL_LABEL_INDEX: LabelIndexFn = (labels) => {
  const i = (label: string) => labels.indexOf(label);
  return {
    gp: i('GP') >= 0 ? i('GP') : i('G'),
    min: i('AB') >= 0 ? i('AB') : i('IP'),
    pts: i('AVG') >= 0 ? i('AVG') : i('H'),
    reb: i('HR'), ast: i('RBI'), stl: i('R'), blk: i('SB'),
    fgPct: i('ERA'), fg3Pct: i('W'), ftPct: i('SO') >= 0 ? i('SO') : i('K'), to: i('SV'),
  };
};

export const TENNIS_LABEL_INDEX: LabelIndexFn = (labels) => {
  const i = (label: string) => labels.indexOf(label);
  const pick = (...candidates: string[]) => {
    for (const c of candidates) {
      const idx = i(c);
      if (idx >= 0) return idx;
    }
    return -1;
  };
  return {
    gp: pick('Events', 'GP', 'Tournaments'),
    min: pick('Matches', 'MIN', 'Match'),
    pts: pick('Wins', 'W', 'Win'),
    reb: pick('Losses', 'L', 'Loss'),
    ast: pick('Titles', 'T', 'Championships'),
    stl: pick('Rank', 'Ranking'),
    blk: pick('-'),
    fgPct: pick('Win%', 'PCT'),
    fg3Pct: pick('Hard', 'Surface'),
    ftPct: pick('-'),
    to: pick('-'),
  };
};

export const GOLF_LABEL_INDEX: LabelIndexFn = (labels) => {
  const i = (label: string) => labels.indexOf(label);
  const pick = (...candidates: string[]) => {
    for (const c of candidates) {
      const idx = i(c);
      if (idx >= 0) return idx;
    }
    return -1;
  };
  return {
    gp: pick('Events', 'GP', 'Starts'),
    min: pick('Rounds', 'Round', 'Rd'),
    pts: pick('Rank', 'Ranking', 'FedEx'),
    reb: pick('Top 10', 'Top10', 'Top 25'),
    ast: pick('Wins', 'Win', 'Victories'),
    stl: pick('Earnings', 'Money'),
    blk: pick('Cuts Made', 'Cuts'),
    fgPct: pick('Scoring Avg', 'Avg', 'Score'),
    fg3Pct: pick('Drive Avg', 'Driving'),
    ftPct: pick('GIR', 'Greens'),
    to: pick('-'),
  };
};

export const FIGHTS_LABEL_INDEX: LabelIndexFn = (labels) => {
  const i = (label: string) => labels.indexOf(label);
  const pick = (...candidates: string[]) => {
    for (const c of candidates) {
      const idx = i(c);
      if (idx >= 0) return idx;
    }
    return -1;
  };
  return {
    gp: pick('Fights', 'GP', 'Bouts'),
    min: pick('-'),
    pts: pick('Wins', 'W', 'Win'),
    reb: pick('Losses', 'L', 'Loss'),
    ast: pick('Draws', 'D', 'NC'),
    stl: pick('KO', 'KO/TKO', 'KOs'),
    blk: pick('SUB', 'Subs', 'Submissions'),
    fgPct: pick('DEC', 'Decisions'),
    fg3Pct: pick('Win%', 'PCT'),
    ftPct: pick('-'),
    to: pick('-'),
  };
};

function rowFromIndices(stats: (string | number)[], idx: PlayerStatIndices): Omit<PlayerSeasonRow, 'season' | 'team'> {
  const val = (i: number) => (i >= 0 && stats[i] !== undefined ? String(stats[i]) : '-');
  return {
    gp: val(idx.gp), min: val(idx.min), pts: val(idx.pts), reb: val(idx.reb), ast: val(idx.ast),
    stl: val(idx.stl), blk: val(idx.blk), fgPct: val(idx.fgPct), fg3Pct: val(idx.fg3Pct),
    ftPct: val(idx.ftPct), to: val(idx.to),
  };
}

export function createParseSeasonHistory(
  labelIndexFn: LabelIndexFn,
  log?: ReturnType<typeof createEngineLog>,
  useZod = false,
) {
  return function parseSeasonHistory(rawData: unknown, rawTeams: unknown): PlayerSeasonRow[] {
    try {
      const data = useZod ? EspnSeasonStatisticsSchema.parse(rawData ?? {}) : (rawData as any) ?? {};
      const teams = rawTeams as Record<string, any>;
      const averages = data?.categories?.find((c: any) => c.name === 'averages');
      if (!averages?.statistics?.length || !Array.isArray(averages.labels)) return [];

      const idx = labelIndexFn(averages.labels);

      return [...averages.statistics].reverse().map((entry: any) => {
        const stats = entry.stats ?? [];
        const team = entry.teamSlug ? teams[entry.teamSlug] : undefined;
        return {
          season: entry.season?.displayName ?? String(entry.season?.year ?? ''),
          team: team?.abbreviation,
          ...rowFromIndices(stats, idx),
        };
      });
    } catch (err) {
      log?.('warn', 'parseSeasonHistory', 'parse failed', err);
      return [];
    }
  };
}

export function createParseGameLog(labelIndexFn: LabelIndexFn, log?: ReturnType<typeof createEngineLog>, useZod = false) {
  return function parseGameLog(rawOverview: unknown): PlayerGameLogRow[] {
    try {
      const overview = useZod ? EspnGameLogSchema.parse(rawOverview ?? {}) : (rawOverview as any) ?? {};
      const gameLog = overview?.gameLog;
      if (!gameLog?.statistics?.[0]) return [];

      const totals = gameLog.statistics[0];
      const labels = totals.labels ?? [];
      const events = totals.events ?? [];
      const eventMap = gameLog.events ?? {};
      if (!Array.isArray(labels) || !Array.isArray(events)) return [];

      const idx = labelIndexFn(labels);

      return events.slice(0, 10).map((entry: any) => {
        const stats = entry.stats ?? [];
        const meta = eventMap[entry.eventId] ?? {};
        const opponent = meta.opponent?.abbreviation ?? meta.opponent?.displayName ?? 'OPP';
        const date = meta.gameDate
          ? new Date(meta.gameDate).toLocaleDateString([], { month: 'short', day: 'numeric' })
          : '—';
        const scoreText = coerceDisplayString(meta.score, '—');
        const result = meta.gameResult && scoreText !== '—' ? `${meta.gameResult} ${scoreText}` : scoreText;
        return {
          date,
          matchup: `${meta.atVs ?? ''} ${opponent}`.trim(),
          result,
          min: String(stats[idx.min] ?? '—'),
          pts: String(stats[idx.pts] ?? '—'),
          reb: String(stats[idx.reb] ?? '—'),
          ast: String(stats[idx.ast] ?? '—'),
          stl: String(stats[idx.stl] ?? '—'),
          blk: String(stats[idx.blk] ?? '—'),
        };
      });
    } catch (err) {
      log?.('warn', 'parseGameLog', 'parse failed', err);
      return [];
    }
  };
}

export function createBuildEspnPlayerDetails(
  heroStatOrder: string[],
  parseSeasonHistory: (raw: unknown, teams: unknown) => PlayerSeasonRow[],
  parseGameLog: (overview: unknown) => PlayerGameLogRow[],
  log?: ReturnType<typeof createEngineLog>,
  useZod = false,
) {
  return function buildEspnPlayerDetails(
    player: Player,
    rawData: unknown,
    profile: ReturnType<typeof getSportProfile>,
  ): PlayerDetails {
    const parsed = useZod ? EspnPlayerDetailsSchema.safeParse(rawData ?? {}) : { success: true, data: rawData };
    const data = parsed.success ? (parsed as { data: any }).data : (rawData as any) ?? {};
    const athlete = data.bio?.athlete ?? data.athlete;
    const overview = data.overview;
    const statsData = data.stats;

    let splitBlocks: PlayerStatSplit[] = [];
    try {
      const mainStats = overview?.statistics;
      if (mainStats?.labels && Array.isArray(mainStats?.splits)) {
        mainStats.splits.forEach((split: { displayName: string; stats?: (string | number)[] }) => {
          if (!split.stats?.length) return;
          splitBlocks.push({
            name: split.displayName,
            stats: mapStatRow(mainStats.labels as string[], split.stats as string[]),
          });
        });
      }
    } catch (err) {
      log?.('warn', 'buildEspnPlayerDetails', 'season splits failed', err);
    }

    let heroStats: StatItem[] = [];
    try {
      const regularSeason = profile.seasonSplitName
        ? splitBlocks.find((s) => s.name === profile.seasonSplitName)
          ?? splitBlocks.find((s) => /regular/i.test(s.name))
        : splitBlocks[0];
      heroStats = regularSeason ? pickHeroStats(regularSeason.stats, heroStatOrder) : pickHeroStats(player.stats, heroStatOrder);
    } catch (err) {
      log?.('warn', 'buildEspnPlayerDetails', 'hero stats failed', err);
      heroStats = player.stats.slice(0, 6);
    }

    let awards: PlayerAward[] = [];
    try {
      awards = (overview?.awards ?? []).map((award: { name?: string; displayCount?: string; seasons?: (string | number)[] }) => ({
        name: award.name ?? 'Award',
        count: award.displayCount ?? '1x',
        seasons: Array.isArray(award.seasons) ? award.seasons.map(String) : [],
      }));
    } catch (err) {
      log?.('warn', 'buildEspnPlayerDetails', 'awards parse failed', err);
    }

    let teamAccent: string | undefined;
    try {
      if (athlete?.team) {
        teamAccent = getTeamAccent({
          color: athlete.team.color ? `#${athlete.team.color}` : undefined,
          alternateColor: athlete.team.alternateColor ? `#${athlete.team.alternateColor}` : undefined,
        });
      }
    } catch (err) {
      log?.('warn', 'buildEspnPlayerDetails', 'team accent failed', err);
    }

    const headshotRaw = athlete?.headshot;
    const headshotHref = typeof headshotRaw === 'object' ? headshotRaw?.href : headshotRaw;

    return {
      id: player.id,
      name: athlete?.displayName ?? player.name,
      team: player.team,
      position: athlete?.position?.abbreviation ?? player.position,
      number: athlete?.jersey ?? player.number,
      height: athlete?.displayHeight ?? player.height,
      weight: athlete?.displayWeight ?? player.weight,
      headshot: player.headshot || player.headshotUrl || headshotHref,
      debutYear: athlete?.debutYear,
      teamAccent,
      heroStats,
      seasonSplits: splitBlocks,
      seasonHistory: parseSeasonHistory(statsData, statsData?.teams ?? {}),
      recentGames: parseGameLog(overview),
      awards,
    };
  };
}

export function createEnrichGameTeams(
  enrichTeam: (abbr: string, partial: object) => { color?: string; alternateColor?: string },
  resolveLogo: (abbr: string, existing?: string) => string,
  log?: ReturnType<typeof createEngineLog>,
) {
  return function enrichGameTeams(game: Game): Game {
    try {
      const gs = (game.sport ?? '').toUpperCase();
      if (gs === 'WNBA' || gs === 'NCAA') return game;

      const awayReg = enrichTeam(game.away.abbr, {});
      const homeReg = enrichTeam(game.home.abbr, {});

      const awayLogo = resolveLogo(game.away.abbr, game.away.logo);
      const homeLogo = resolveLogo(game.home.abbr, game.home.logo);

      const enriched: Game = {
        ...game,
        away: {
          ...game.away,
          logo: awayLogo || game.away.logo,
          logoFallback:
            game.away.logo && awayLogo && game.away.logo !== awayLogo
              ? game.away.logo
              : game.away.logoFallback,
          color: game.away.color ?? awayReg.color,
          alternateColor: game.away.alternateColor ?? awayReg.alternateColor,
        },
        home: {
          ...game.home,
          logo: homeLogo || game.home.logo,
          logoFallback:
            game.home.logo && homeLogo && game.home.logo !== homeLogo
              ? game.home.logo
              : game.home.logoFallback,
          color: game.home.color ?? homeReg.color,
          alternateColor: game.home.alternateColor ?? homeReg.alternateColor,
        },
      };

      if (enriched.timing?.startTime) return refreshGameTiming(enriched);
      return enriched;
    } catch (err) {
      log?.('warn', 'enrichGameTeams', 'enrich failed', err);
      return game;
    }
  };
}

export const PREFETCH_CONCURRENCY = 4;

const prefetchInFlight = new Set<string>();

/** Clear prefetch tracking (tests only). */
export function resetPrefetchTracking(): void {
  prefetchInFlight.clear();
}

export function prefetchLiveDetails(
  getGameDetail: (game: Game) => Promise<unknown>,
  games: Game[],
  log: ReturnType<typeof createEngineLog>,
): void {
  const liveGames = games.filter((g) => g.statusState === 'in' && !prefetchInFlight.has(g.id));
  if (!liveGames.length) return;

  const chunks: Game[][] = [];
  for (let i = 0; i < liveGames.length; i += PREFETCH_CONCURRENCY) {
    chunks.push(liveGames.slice(i, i + PREFETCH_CONCURRENCY));
  }

  void (async () => {
    for (const chunk of chunks) {
      await Promise.allSettled(
        chunk.map((game) => {
          prefetchInFlight.add(game.id);
          return getGameDetail(game)
            .catch((err) => {
              log('warn', 'prefetchLiveDetails', `prefetch failed for ${game.id}`, err);
            })
            .finally(() => {
              prefetchInFlight.delete(game.id);
            });
        }),
      );
    }
  })();
}

export function scoringPlaysToEventLog(plays: Game['plays']): { label: string; value: string }[] | undefined {
  if (!plays?.length) return undefined;
  return plays
    .filter((p) => p.scoringPlay)
    .slice(0, 12)
    .map((p) => ({ label: `${p.period} ${p.clock}`.trim(), value: p.text }));
}

export function parseEspnSearchResults(espnResults: unknown): Player[] {
  const players: Player[] = [];
  const seen = new Set<string>();

  if (!Array.isArray(espnResults)) return players;

  for (const item of espnResults) {
    type SearchAthlete = {
      id?: string | number;
      displayName?: string;
      fullName?: string;
      team?: { abbreviation?: string };
      position?: { abbreviation?: string };
      headshot?: string | { href?: string };
    };
    const entry = item as { athlete?: SearchAthlete } & SearchAthlete;
    const athlete: SearchAthlete = entry.athlete ?? entry;
    const id = String(athlete.id ?? '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const headshotRaw = athlete.headshot;
    const leagueSlug = (entry as { leagueSlug?: string }).leagueSlug;
    players.push({
      id,
      name: athlete.displayName ?? athlete.fullName ?? '',
      team: athlete.team?.abbreviation ?? '—',
      position: athlete.position?.abbreviation ?? '—',
      leagueSport: leagueSlug,
      headshot: typeof headshotRaw === 'object' ? headshotRaw?.href : headshotRaw,
      stats: [],
    });
  }

  return players;
}

export function createPlayerFallback(player: Player, sport: import('../sportConfig').EngineSport): PlayerDetails {
  const profile = getPlayerProfileForLeague(sport, player.leagueSport);
  return {
    id: player.id,
    name: player.name,
    team: player.team,
    position: player.position,
    number: player.number,
    height: player.height,
    weight: player.weight,
    headshot: player.headshot || player.headshotUrl,
    heroStats: pickHeroStats(player.stats, profile.heroStatLabels),
    seasonSplits: player.stats.length
      ? [{ name: profile.seasonSplitName ?? 'Regular Season', stats: player.stats }]
      : [],
    seasonHistory: [],
    recentGames: [],
    awards: [],
  };
}
