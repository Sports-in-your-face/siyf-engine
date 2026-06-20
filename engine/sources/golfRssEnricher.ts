import { createEngineLog } from '../core/engineUtils';
import { enrichGameContext } from '../core/mergePayload';
import { loadRssFeedItems, loadRssFeedsParallel } from '../core/rssFeedCache';
import {
  textMentionsPlayer,
  type RssItem,
} from '../core/rss';
import { isScoreboardNoiseText } from '../../utils/scoreboardNoise';
import type { Game } from '../core/types';

const log = createEngineLog('golf-rss');

interface GolfRssFeedDefinition {
  id: string;
  name: string;
  url: string;
}

export const GOLF_RSS_FEEDS: GolfRssFeedDefinition[] = [
  { id: 'espn_golf', name: 'ESPN Golf', url: 'https://www.espn.com/espn/rss/golf/news' },
  { id: 'golf_com', name: 'Golf.com', url: 'https://golf.com/feed/' },
  { id: 'yahoo_golf', name: 'Yahoo Golf', url: 'https://sports.yahoo.com/golf/rss/' },
];

async function getFeedItems(feed: GolfRssFeedDefinition): Promise<RssItem[]> {
  return loadRssFeedItems('golf-rss-feed', feed.id, feed.url);
}

function isGolfGame(game: Game): boolean {
  return !game.sport || game.sport === 'GOLF' || game.sport === 'PGA' || game.sport === 'LPGA';
}

function isGenericNewsHeadline(title: string): boolean {
  return isScoreboardNoiseText(title)
    || /podcast|betting odds|fantasy golf|equipment review|instruction/i.test(title);
}

function findTournamentItem(items: RssItem[], game: Game): RssItem | undefined {
  const tournament = game.tournamentName ?? game.subtitle ?? '';
  const leader = game.away?.name ?? '';

  return items.find((item) => {
    const text = `${item.title} ${item.description ?? ''}`;
    if (isGenericNewsHeadline(text)) return false;
    if (tournament && text.toLowerCase().includes(tournament.toLowerCase())) return true;
    if (leader && leader !== 'TBD' && textMentionsPlayer(text, leader)) return true;
    return false;
  });
}

export async function enrichGolfGamesFromRss(games: Game[]): Promise<Game[]> {
  if (!games.length) return games;

  const headlineItems = await loadRssFeedsParallel('golf-rss-feed', GOLF_RSS_FEEDS, 25);

  return games.map((game) => {
    try {
      if (!isGolfGame(game)) return game;
      const hit = findTournamentItem(headlineItems, game);
      if (!hit || isScoreboardNoiseText(hit.title)) return game;

      let enriched = game;
      if (!enriched.context?.headline) {
        enriched = enrichGameContext(enriched, {
          headline: hit.title.slice(0, 100),
          priority: Math.max(game.context?.priority ?? 0, 300),
        });
      }

      if (game.statusState === 'in' && !enriched.context?.badge) {
        enriched = enrichGameContext(enriched, {
          badge: 'LIVE',
          priority: Math.max(enriched.context?.priority ?? 0, 400),
        });
      }

      return enriched;
    } catch (err) {
      log('warn', 'enrichGolfGamesFromRss', `enrichment failed for ${game.id}`, err);
      return game;
    }
  });
}

export async function golfRssCrossCheckMajorHint(tournamentName: string): Promise<{ headline?: string } | null> {
  for (const feed of GOLF_RSS_FEEDS) {
    const items = await getFeedItems(feed);
    const hit = items.find((item) => {
      if (isScoreboardNoiseText(item.title)) return false;
      const text = `${item.title} ${item.description ?? ''}`;
      return text.toLowerCase().includes(tournamentName.toLowerCase())
        && /leader|round|cut|champion|major|final/i.test(text);
    });
    if (hit) return { headline: hit.title.slice(0, 100) };
  }
  return null;
}
