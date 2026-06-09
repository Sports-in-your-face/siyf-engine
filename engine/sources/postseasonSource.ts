import { cacheKey } from '../core/cache';
import { fetchRssFeed } from '../core/rss';
import { dedupeRequest, fetchJsonResilient } from '../core/resilientFetch';
import { rssCrossCheckFromFeeds } from './rssEnricher';

const BASE = '/api/espn/apis/site/v2/sports/basketball/nba';

function formatEspnDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function nextDates(count: number): string[] {
  const dates: string[] = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    dates.push(formatEspnDate(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function eventStartMs(event: any): number {
  const raw = event?.date ?? event?.competitions?.[0]?.date;
  const ms = raw ? new Date(raw).getTime() : Number.NaN;
  return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms;
}

/** ESPN repeats the same event on future scoreboard days with shifted placeholder dates — keep earliest. */
function mergeEvents(boards: any[]): any[] {
  const byId = new Map<string, any>();
  for (const board of boards) {
    for (const event of board?.events ?? []) {
      if (!event?.id) continue;
      const id = String(event.id);
      const existing = byId.get(id);
      if (!existing || eventStartMs(event) < eventStartMs(existing)) {
        byId.set(id, event);
      }
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => eventStartMs(a) - eventStartMs(b),
  );
}

/** During postseason, scan today + upcoming days so scheduled Finals Game 3 isn't missed */
export async function espnPostseasonScoreboard(): Promise<any | null> {
  const todayBoard = await fetchJsonResilient<any>(`${BASE}/scoreboard`, undefined, {
    label: 'espn-scoreboard-today',
    retries: 2,
  });
  if (!todayBoard) return null;

  const seasonType = todayBoard?.season?.type ?? todayBoard?.leagues?.[0]?.season?.type?.type;
  const isPostseason = seasonType === 3 || seasonType === '3';

  if (!isPostseason) return todayBoard;

  const dates = nextDates(5).slice(1); // skip today, already fetched
  const extraBoards = await Promise.all(
    dates.map((date) =>
      fetchJsonResilient<any>(`${BASE}/scoreboard?dates=${date}`, undefined, {
        label: `espn-scoreboard-${date}`,
        retries: 1,
        timeout: 6_000,
      }),
    ),
  );

  const allEvents = mergeEvents([todayBoard, ...extraBoards.filter(Boolean)]);
  return { ...todayBoard, events: allEvents };
}

/** Best-effort RSS cross-check for series context when API notes are sparse (internal only) */
export async function rssCrossCheckSeriesHint(
  awayName: string,
  homeName: string,
): Promise<{ headline?: string; seriesSummary?: string } | null> {
  const awayLast = awayName.split(' ').pop()?.toLowerCase() ?? '';
  const homeLast = homeName.split(' ').pop()?.toLowerCase() ?? '';
  const awayAbbr = awayName.slice(0, 3).toUpperCase();
  const homeAbbr = homeName.slice(0, 3).toUpperCase();

  const fromFeeds = await rssCrossCheckFromFeeds(awayName, homeName, awayAbbr, homeAbbr);
  if (fromFeeds) return fromFeeds;

  const feeds = [
    'https://www.espn.com/espn/rss/nba/news',
    'https://feeds.feedburner.com/nba/rss',
  ];

  for (const url of feeds) {
    const items = await fetchRssFeed(url);
    for (const item of items) {
      const title = item.title;
      const lower = title.toLowerCase();

      const isFinals = /nba finals|finals game/i.test(lower);
      const mentionsTeams =
        (awayLast && lower.includes(awayLast)) || (homeLast && lower.includes(homeLast));

      if (isFinals && mentionsTeams) {
        const gameNum = title.match(/game\s*(\d+)/i)?.[1];
        const headline = gameNum ? `NBA Finals - Game ${gameNum}` : 'NBA Finals';
        const seriesMatch = title.match(/(\d+\s*-\s*\d+)/);
        return {
          headline,
          seriesSummary: seriesMatch?.[1] ? `Series ${seriesMatch[1]}` : undefined,
        };
      }
    }
  }
  return null;
}

export function dedupeScoreboardFetch(key: string, fn: () => Promise<any | null>) {
  return dedupeRequest(key, fn);
}

export const POSTSEASON_SCOREBOARD_KEY = cacheKey('espn', 'postseason-scoreboard');
