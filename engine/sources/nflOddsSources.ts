import { fetchCachedPaidOdds } from '../core/cachedOddsFetch';
import type { Game, GameContext, Player, StatItem } from '../../types';
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

function normalizeTeamName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchOddsEvent(event: OddsEvent, game: Game): boolean {
  const away = normalizeTeamName(game.away.name);
  const home = normalizeTeamName(game.home.name);
  const eAway = normalizeTeamName(event.away_team);
  const eHome = normalizeTeamName(event.home_team);
  return (
    (eAway.includes(away.slice(0, 5)) || away.includes(eAway.slice(0, 5)))
    && (eHome.includes(home.slice(0, 5)) || home.includes(eHome.slice(0, 5)))
  );
}

async function fetchNflOdds(): Promise<OddsEvent[]> {
  return fetchCachedPaidOdds(
    'nfl',
    `${PROXY_BASE}/sports/americanfootball_nfl/odds?regions=us&markets=spreads,totals,h2h`,
    'odds-nfl',
    ['nfl'],
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

function isNflGame(game: Game): boolean {
  return !game.sport || game.sport === 'FOOTBALL' || game.sport === 'NFL';
}

export async function enrichNflGamesWithOdds(games: Game[]): Promise<Game[]> {
  const needing = filterGamesNeedingOdds(games, isNflGame);
  if (!needing.length) return games;

  let enriched = await enrichGamesWithActionNetworkOdds(games, 'FOOTBALL');
  const stillMissing = filterGamesNeedingOdds(enriched, isNflGame);
  if (!stillMissing.length) return enriched;

  const events = await fetchNflOdds();
  if (!events.length) return enriched;

  return enriched.map((game) => {
    if (!isNflGame(game) || gameHasOddsContext(game)) return game;
    const event = events.find((e) => matchOddsEvent(e, game));
    if (!event) return game;
    const ctx = extractSpreadContext(event);
    return ctx ? enrichGameContext(game, ctx) : game;
  });
}

export async function fetchNflFanDuelTopPerformers(game: Game): Promise<Player[] | null> {
  if (!detailNeedsTopPerformers(game)) return null;

  const events = await fetchNflOdds();
  const event = events.find((e) => matchOddsEvent(e, game));
  if (!event) return null;

  for (const book of event.bookmakers ?? []) {
    if (!/fanduel/i.test(book.key ?? book.title)) continue;
    const playerMarket = book.markets?.find((m) => /player|prop|pass|rush|rec/i.test(m.key));
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

