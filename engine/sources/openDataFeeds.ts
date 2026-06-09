import { externalFetchUrl } from '../../config/siyfApi';
import { fetchJsonResilient } from '../core/resilientFetch';
import { parseEventsForSport } from '../../services/parsers/parseGameEvent';
import { coerceDisplayString, parseDisplayScore } from '../../utils/coerce';
import type { Game, LeagueContext } from '../../types';

const ESPN_WNBA = '/api/espn/apis/site/v2/sports/basketball/wnba/scoreboard';

function isNcaaMensSeason(date = new Date()): boolean {
  const month = date.getMonth() + 1;
  return month >= 11 || month <= 4;
}

function ncaaScoreboardUrl(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const path = `/casablanca/scoreboard/basketball-mens-d1/${y}/${m}/${d}/scoreboard.json`;
  return externalFetchUrl(`https://data.ncaa.com${path}`);
}

function parseNcaaGames(raw: any): Game[] {
  const games: Game[] = [];
  for (const entry of raw?.games ?? []) {
    const g = entry?.game ?? entry;
    if (!g) continue;
    const away = g.away ?? g.awayTeam;
    const home = g.home ?? g.homeTeam;
    if (!away || !home) continue;

    const awayName = away.names?.short ?? away.name?.short ?? away.name ?? 'Away';
    const homeName = home.names?.short ?? home.name?.short ?? home.name ?? 'Home';
    const state = String(g.gameState ?? g.status ?? '').toLowerCase();
    const statusState =
      state.includes('final') ? 'post' as const
      : state.includes('live') || state.includes('progress') ? 'in' as const
      : 'pre' as const;

    games.push({
      id: String(g.gameID ?? g.id ?? `${awayName}-${homeName}-${g.startDate ?? ''}`),
      sport: 'NCAA',
      status: g.gameState ?? g.status ?? (statusState === 'post' ? 'Final' : 'Scheduled'),
      statusState,
      clock: statusState === 'post' ? 'Final' : statusState === 'in' ? 'Live' : '—',
      away: {
        name: awayName,
        abbr: awayName.slice(0, 4).toUpperCase(),
        score: away.score ?? away.points ?? null,
        logo: away.logo ?? away.logoUrl,
      },
      home: {
        name: homeName,
        abbr: homeName.slice(0, 4).toUpperCase(),
        score: home.score ?? home.points ?? null,
        logo: home.logo ?? home.logoUrl,
      },
    });
  }
  return games;
}

async function fetchWnbaOfficial(): Promise<Game[]> {
  const urls = [
    externalFetchUrl('https://www.wnba.com/api/live/scoreboard'),
    externalFetchUrl('https://cdn.wnba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json'),
  ];
  for (const url of urls) {
    const raw = await fetchJsonResilient<any>(url, undefined, { label: 'wnba-official', retries: 1, timeout: 5_000 });
    const events = raw?.scoreboard?.games ?? raw?.games ?? raw?.events;
    if (Array.isArray(events) && events.length) {
      return events.map((g: any) => {
        const away = g.awayTeam ?? g.away ?? {};
        const home = g.homeTeam ?? g.home ?? {};
        const state = String(g.gameStatus ?? g.status ?? '').toLowerCase();
        const statusState =
          state.includes('final') ? 'post' as const
          : state.includes('in') || state.includes('live') ? 'in' as const
          : 'pre' as const;
        return {
          id: String(g.gameId ?? g.id ?? `${away.teamTricode}-${home.teamTricode}`),
          sport: 'WNBA',
          status: g.gameStatusText ?? g.status ?? 'Scheduled',
          statusState,
          clock: g.period != null ? `Q${g.period}` : statusState === 'post' ? 'Final' : '—',
          away: {
            name: coerceDisplayString(away.teamName ?? away.name, away.teamTricode ?? 'Away'),
            abbr: coerceDisplayString(away.teamTricode ?? away.abbr, 'AWAY'),
            score: parseDisplayScore(away.score ?? away.points),
            logo: coerceDisplayString(away.teamLogo ?? away.logo),
          },
          home: {
            name: coerceDisplayString(home.teamName ?? home.name, home.teamTricode ?? 'Home'),
            abbr: coerceDisplayString(home.teamTricode ?? home.abbr, 'HOME'),
            score: parseDisplayScore(home.score ?? home.points),
            logo: coerceDisplayString(home.teamLogo ?? home.logo),
          },
        } satisfies Game;
      });
    }
  }
  return [];
}

async function fetchWnbaEspn(): Promise<Game[]> {
  const raw = await fetchJsonResilient<any>(ESPN_WNBA, undefined, { label: 'wnba-espn', retries: 2 });
  if (!raw?.events?.length) return [];
  return parseEventsForSport(raw.events, 'BASKETBALL').map((g) => ({ ...g, sport: 'WNBA' }));
}

export async function fetchWnbaScoreboard(): Promise<Game[]> {
  const espn = await fetchWnbaEspn();
  if (espn.length) return espn;
  return fetchWnbaOfficial();
}

export async function fetchNcaaScoreboard(): Promise<Game[]> {
  if (!isNcaaMensSeason()) return [];

  const raw = await fetchJsonResilient<any>(ncaaScoreboardUrl(), undefined, {
    label: 'ncaa-scoreboard',
    retries: 0,
    timeout: 8_000,
  });
  return raw ? parseNcaaGames(raw) : [];
}

export async function fetchWnbaLeagueContext(): Promise<LeagueContext | null> {
  const raw = await fetchJsonResilient<any>(ESPN_WNBA, undefined, { label: 'wnba-league', retries: 1 });
  if (!raw) return null;
  const season = raw.season ?? raw.leagues?.[0]?.season;
  const year = season?.year ?? new Date().getFullYear();
  const type = season?.type ?? season?.type?.type;
  const isPostseason = type === 3 || type === '3';
  return {
    seasonYear: year,
    seasonPhase: isPostseason ? 'playoffs' : 'regular',
    seasonLabel: 'WNBA',
    isPostseason,
  };
}

export async function fetchSupplementalScoreboards(): Promise<{ games: Game[]; sources: string[] }> {
  const sources: string[] = [];
  let games: Game[] = [];

  const results = await Promise.allSettled([
    fetchWnbaScoreboard(),
    fetchNcaaScoreboard(),
  ]);

  const [wnba, ncaa] = results;
  if (wnba.status === 'fulfilled' && wnba.value.length) {
    games = games.concat(wnba.value);
    sources.push('wnba');
  }
  if (ncaa.status === 'fulfilled' && ncaa.value.length) {
    games = games.concat(ncaa.value);
    sources.push('ncaa');
  }

  return { games, sources };
}
