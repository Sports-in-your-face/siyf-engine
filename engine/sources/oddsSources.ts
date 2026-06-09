import { fetchCachedPaidOdds } from '../core/cachedOddsFetch';
import type { Game, GameContext, Player, StatItem } from '../../types';
import { matchOddsEventToGame } from '../core/oddsMatching';
import { gameMatchKey } from '../core/mergeGames';
import { enrichGameContext } from '../core/mergePayload';
import { enrichGamesWithActionNetworkOdds } from './actionNetworkSource';
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

function isNbaOddsGame(game: Game): boolean {
  const s = game.sport;
  if (!s) return true;
  if (s === 'WNBA' || s === 'NCAA') return false;
  return s === 'NBA' || s === 'BASKETBALL';
}

function matchOddsEvent(event: OddsEvent, game: Game): boolean {
  return matchOddsEventToGame(event, game, { useAbbr: true });
}

async function fetchNbaOdds(): Promise<OddsEvent[]> {
  return fetchCachedPaidOdds(
    'nba',
    `${PROXY_BASE}/sports/basketball_nba/odds?regions=us&markets=spreads,totals,h2h`,
    'odds-nba',
    ['nba'],
  );
}

function extractSpreadContext(event: OddsEvent): Partial<GameContext> | null {
  for (const book of event.bookmakers ?? []) {
    if (!/betmgm|draftkings|fanduel|caesars/i.test(book.key ?? book.title)) continue;
    const spreadMarket = book.markets?.find((m) => m.key === 'spreads');
    if (!spreadMarket?.outcomes?.length) continue;

    const lines = spreadMarket.outcomes
      .map((o) => `${o.name} ${o.point != null ? (o.point > 0 ? `+${o.point}` : o.point) : ''}`.trim())
      .join(' · ');
    const totals = book.markets?.find((m) => m.key === 'totals');
    const ou = totals?.outcomes?.[0]?.point;

    return {
      oddsSpread: lines,
      oddsTotal: ou != null ? `O/U ${ou}` : undefined,
      oddsBook: book.title?.toUpperCase().slice(0, 12),
      priority: 200,
    };
  }
  return null;
}

export async function enrichGamesWithOdds(games: Game[]): Promise<Game[]> {
  const needing = filterGamesNeedingOdds(games, isNbaOddsGame);
  if (!needing.length) return games;

  let enriched = await enrichGamesWithActionNetworkOdds(games, 'BASKETBALL');

  const stillMissing = filterGamesNeedingOdds(enriched, isNbaOddsGame);
  if (!stillMissing.length) return enriched;

  const events = await fetchNbaOdds();
  if (!events.length) return enriched;

  return enriched.map((game) => {
    if (!isNbaOddsGame(game) || gameHasOddsContext(game)) return game;
    const event = events.find((e) => matchOddsEvent(e, game));
    if (!event) return game;
    const ctx = extractSpreadContext(event);
    return ctx ? enrichGameContext(game, ctx) : game;
  });
}

export async function fetchFanDuelTopPerformers(game: Game): Promise<Player[] | null> {
  if (!detailNeedsTopPerformers(game)) return null;

  const events = await fetchNbaOdds();
  const event = events.find((e) => matchOddsEvent(e, game));
  if (!event) return null;

  for (const book of event.bookmakers ?? []) {
    if (!/fanduel/i.test(book.key ?? book.title)) continue;
    const playerMarket = book.markets?.find((m) => /player|prop|points/i.test(m.key));
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

export { gameMatchKey };
