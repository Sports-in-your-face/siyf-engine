import { cacheKey, cachedFetch } from '../core/cache';
import { profileForResource } from '../core/cacheTiers';
import { fetchJsonResilient } from '../core/resilientFetch';
import type { GameDetail, PitchMetric } from '../core/types';
import type { Game } from '../../types';

const MLB_STATS_V1 = '/api/mlb-stats/api/v1';
const MLB_STATS_FEED = '/api/mlb-stats/api/v1.1';

/** ESPN ↔ MLB Stats API abbreviation normalization. */
const ABBR_ALIASES: Record<string, string> = {
  ATH: 'ATH',
  AZ: 'ARI',
  WSH: 'WSH',
};

function normalizeAbbr(abbr: string): string {
  const up = String(abbr || '').trim().toUpperCase();
  return ABBR_ALIASES[up] ?? up;
}

function formatScheduleDate(input?: string): string {
  if (input) {
    const d = new Date(input);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }
  return new Date().toISOString().slice(0, 10);
}

interface MlbScheduleGame {
  gamePk?: number;
  teams?: {
    away?: { team?: { abbreviation?: string } };
    home?: { team?: { abbreviation?: string } };
  };
}

interface MlbLivePlayEvent {
  index?: number;
  isPitch?: boolean;
  pitchData?: {
    startSpeed?: number;
    zone?: number;
    coordinates?: { x?: number; y?: number };
    pitchType?: string;
  };
  hitData?: {
    launchAngle?: number;
    launchSpeed?: number;
  };
  details?: {
    description?: string;
    type?: { description?: string };
    call?: { description?: string };
  };
}

interface MlbLivePlay {
  atBatIndex?: number;
  about?: { inning?: number; halfInning?: string };
  matchup?: {
    batter?: { fullName?: string };
    pitcher?: { fullName?: string };
  };
  playEvents?: MlbLivePlayEvent[];
}

export function extractGamePkFromEspnSummary(summary: unknown): number | null {
  if (!summary || typeof summary !== 'object') return null;
  const root = summary as Record<string, unknown>;

  const header = root.header as { competitions?: Array<{ guid?: string; id?: string }> } | undefined;
  const guid = header?.competitions?.[0]?.guid;
  if (guid) {
    const gMatch = /(?:^|~)g:(\d+)/i.exec(guid);
    if (gMatch) return Number(gMatch[1]);
  }

  const gameInfo = root.gameInfo as { id?: string | number } | undefined;
  if (gameInfo?.id != null) {
    const n = Number(gameInfo.id);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
}

function matchGamePkFromSchedule(
  games: MlbScheduleGame[],
  awayAbbr: string,
  homeAbbr: string,
): number | null {
  const away = normalizeAbbr(awayAbbr);
  const home = normalizeAbbr(homeAbbr);
  for (const g of games) {
    const gAway = normalizeAbbr(g.teams?.away?.team?.abbreviation ?? '');
    const gHome = normalizeAbbr(g.teams?.home?.team?.abbreviation ?? '');
    if (gAway === away && gHome === home && g.gamePk) return g.gamePk;
  }
  return null;
}

export async function fetchMlbSchedule(date: string): Promise<MlbScheduleGame[]> {
  const key = cacheKey('mlb-stats', 'schedule', date);
  const data = await cachedFetch(
    key,
    profileForResource('schedule'),
    ({ bypassCache }) =>
      fetchJsonResilient<{ dates?: Array<{ games?: MlbScheduleGame[] }> }>(
        `${MLB_STATS_V1}/schedule?sportId=1&date=${date}&hydrate=team`,
        undefined,
        { label: `mlb-stats-schedule-${date}`, retries: 2, bypassCache },
      ),
    ['schedule', 'mlb'],
  );
  return data?.dates?.[0]?.games ?? [];
}

export async function fetchMlbLiveFeed(gamePk: number): Promise<unknown | null> {
  const key = cacheKey('mlb-stats', 'live-feed', String(gamePk));
  return cachedFetch(
    key,
    profileForResource('summary', 'in'),
    ({ bypassCache }) =>
      fetchJsonResilient(
        `${MLB_STATS_FEED}/game/${gamePk}/feed/live`,
        undefined,
        {
          label: `mlb-stats-live-${gamePk}`,
          retries: 2,
          timeout: 12_000,
          bypassCache,
        },
      ),
    [`game:${gamePk}`, 'mlb'],
  );
}

export async function resolveMlbGamePk(
  game: Game,
  summary: unknown | null,
): Promise<number | null> {
  const fromSummary = extractGamePkFromEspnSummary(summary);
  if (fromSummary) return fromSummary;

  const date = formatScheduleDate(game.timing?.startTime);
  const scheduleGames = await fetchMlbSchedule(date);
  const pk = matchGamePkFromSchedule(scheduleGames, game.away.abbr, game.home.abbr);
  if (pk) return pk;

  if (game.timing?.startTime) {
    const prev = new Date(game.timing.startTime);
    prev.setDate(prev.getDate() - 1);
    const prevGames = await fetchMlbSchedule(prev.toISOString().slice(0, 10));
    return matchGamePkFromSchedule(prevGames, game.away.abbr, game.home.abbr);
  }

  return null;
}

export function parsePitchMetricsFromLiveFeed(feed: unknown, limit = 40): PitchMetric[] {
  if (!feed || typeof feed !== 'object') return [];
  const liveData = (feed as { liveData?: { plays?: { allPlays?: MlbLivePlay[] } } }).liveData;
  const allPlays = liveData?.plays?.allPlays ?? [];
  const pitches: PitchMetric[] = [];

  for (const play of allPlays) {
    const inning = play.about?.inning ?? 0;
    const halfRaw = String(play.about?.halfInning ?? '').toLowerCase();
    const half: 'top' | 'bottom' = halfRaw === 'top' ? 'top' : 'bottom';
    const batter = play.matchup?.batter?.fullName;
    const pitcher = play.matchup?.pitcher?.fullName;
    const atBatIndex = play.atBatIndex ?? 0;

    for (const event of play.playEvents ?? []) {
      const pitchData = event.pitchData;
      const hitData = event.hitData;
      if (!event.isPitch && !pitchData && !hitData) continue;

      const metric: PitchMetric = {
        id: `${atBatIndex}-${event.index ?? pitches.length}`,
        inning,
        half,
        batter,
        pitcher,
        pitchType: event.details?.type?.description ?? pitchData?.pitchType,
        speed: pitchData?.startSpeed,
        zone: pitchData?.zone,
        x: pitchData?.coordinates?.x,
        y: pitchData?.coordinates?.y,
        launchAngle: hitData?.launchAngle,
        exitVelocity: hitData?.launchSpeed,
        result: event.details?.call?.description,
        description: event.details?.description,
      };

      if (
        metric.speed != null
        || metric.pitchType
        || metric.launchAngle != null
        || metric.exitVelocity != null
        || metric.description
      ) {
        pitches.push(metric);
      }
    }
  }

  if (pitches.length <= limit) return pitches;
  return pitches.slice(-limit);
}

export async function fetchMlbPitchMetricsForGame(
  game: Game | GameDetail,
  summary: unknown | null,
): Promise<PitchMetric[]> {
  if (game.sport && game.sport !== 'BASEBALL') return [];
  if (game.statusState === 'pre') return [];

  const gamePk = await resolveMlbGamePk(game, summary);
  if (!gamePk) return [];

  const feed = await fetchMlbLiveFeed(gamePk);
  if (!feed) return [];

  return parsePitchMetricsFromLiveFeed(feed);
}
