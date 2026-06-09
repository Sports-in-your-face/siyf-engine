import { fetchCachedPaidOdds } from '../core/cachedOddsFetch';
import type { Game, GameContext, Player, StatItem } from '../../types';
import { matchOddsEventToGame } from '../core/oddsMatching';
import { enrichGameContext } from '../core/mergePayload';
import {
  resolveSoccerOddsKey,
  soccerOddsKeysForLeagues,
} from '../core/soccerOddsLeagues';
import {
  detailNeedsTopPerformers,
  filterGamesNeedingOdds,
  gameHasOddsContext,
} from '../core/paidApiPolicy';
import { siyfApiUrl } from '../../config/siyfApi';

const PROXY_BASE = siyfApiUrl('/api/odds');

interface OddsOutcome {
  name: string;
  price?: number;
  point?: number;
}

interface OddsMarket {
  key: string;
  outcomes: OddsOutcome[];
}

interface OddsBookmaker {
  key: string;
  title: string;
  markets: OddsMarket[];
}

interface OddsEvent {
  id: string;
  home_team: string;
  away_team: string;
  bookmakers?: OddsBookmaker[];
}

function matchOddsEvent(event: OddsEvent, game: Game): boolean {
  return matchOddsEventToGame(event, game, { prefixLen: 4, useAbbr: false });
}

async function fetchSoccerOddsForKey(oddsKey: string): Promise<OddsEvent[]> {
  return fetchCachedPaidOdds(
    oddsKey,
    `${PROXY_BASE}/sports/${oddsKey}/odds?regions=us&markets=spreads,totals,h2h`,
    `odds-${oddsKey}`,
    ['soccer'],
  );
}

function extractSpreadContext(event: OddsEvent): Partial<GameContext> | null {
  for (const book of event.bookmakers ?? []) {
    if (!/betmgm|draftkings|fanduel|caesars/i.test(book.key ?? book.title)) continue;
    const h2h = book.markets?.find((m) => m.key === 'h2h');
    const totals = book.markets?.find((m) => m.key === 'totals');
    const ou = totals?.outcomes?.[0]?.point;
    const ml = h2h?.outcomes?.map((o) => `${o.name} ${o.price ?? ''}`.trim()).join(' · ');

    return {
      oddsSpread: ml,
      oddsTotal: ou != null ? `O/U ${ou}` : undefined,
      oddsBook: book.title?.toUpperCase().slice(0, 12),
      priority: 200,
    };
  }
  return null;
}

function isSoccerGame(game: Game): boolean {
  return !game.sport || game.sport === 'SOCCER';
}

async function fetchSoccerOddsForLeagues(leagues: Set<string>): Promise<Map<string, OddsEvent[]>> {
  const map = new Map<string, OddsEvent[]>();
  const keysToFetch = soccerOddsKeysForLeagues(leagues);
  if (!keysToFetch.length) return map;

  await Promise.all(
    keysToFetch.map(async ({ key, leagues: ls }) => {
      const events = await fetchSoccerOddsForKey(key);
      for (const league of ls) map.set(league, events);
    }),
  );
  return map;
}

export async function enrichSoccerGamesWithOdds(games: Game[]): Promise<Game[]> {
  const needing = filterGamesNeedingOdds(games, isSoccerGame);
  if (!needing.length) return games;

  const leaguesNeeded = new Set(needing.map((g) => g.leagueSlug ?? 'eng.1'));
  const oddsMap = await fetchSoccerOddsForLeagues(leaguesNeeded);
  if (!oddsMap.size) return games;

  return games.map((game) => {
    if (!isSoccerGame(game) || gameHasOddsContext(game)) return game;
    const league = game.leagueSlug ?? 'eng.1';
    const events = oddsMap.get(league) ?? oddsMap.get('eng.1') ?? [];
    const event = events.find((e) => matchOddsEvent(e, game));
    if (!event) return game;
    const ctx = extractSpreadContext(event);
    return ctx ? enrichGameContext(game, ctx) : game;
  });
}

export async function fetchSoccerFanDuelTopPerformers(game: Game): Promise<Player[] | null> {
  if (!detailNeedsTopPerformers(game)) return null;

  const league = game.leagueSlug ?? 'eng.1';
  const oddsKey = resolveSoccerOddsKey(league);
  const events = await fetchSoccerOddsForKey(oddsKey);
  const event = events.find((e) => matchOddsEvent(e, game));
  if (!event) return null;

  for (const book of event.bookmakers ?? []) {
    if (!/fanduel/i.test(book.key ?? book.title)) continue;
    const playerMarket = book.markets?.find((m) => /player|prop|goal|assist/i.test(m.key));
    if (!playerMarket?.outcomes?.length) continue;

    return playerMarket.outcomes.slice(0, 5).map((o, idx) => ({
      id: `${game.id}-fd-${idx}`,
      name: o.name,
      team: '—',
      position: '—',
      stats: [{ label: 'FD', value: o.point ?? o.price ?? '—' }] as StatItem[],
    }));
  }
  return null;
}

export { resolveSoccerOddsKey } from '../core/soccerOddsLeagues';
