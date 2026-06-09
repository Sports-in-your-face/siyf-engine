import { loadRssFeedItems, loadRssFeedsParallel } from '../core/rssFeedCache';
import {
  textMentionsPlayer,
  type RssItem,
} from '../core/rss';
import { enrichGameContext } from '../core/mergePayload';
import type { Game } from '../core/types';
import { enrichWtaTennisHeadshots } from './wtaTennisSource';

interface TennisRssFeedDefinition {
  id: string;
  name: string;
  url: string;
}

export const TENNIS_RSS_FEEDS: TennisRssFeedDefinition[] = [
  { id: 'espn_tennis', name: 'ESPN Tennis', url: 'https://www.espn.com/espn/rss/tennis/news' },
  { id: 'tennis_com', name: 'Tennis.com', url: 'https://www.tennis.com/rss/news.xml' },
  { id: 'yahoo_tennis', name: 'Yahoo Tennis', url: 'https://sports.yahoo.com/tennis/rss/' },
];

async function getFeedItems(feed: TennisRssFeedDefinition): Promise<RssItem[]> {
  return loadRssFeedItems('tennis-rss-feed', feed.id, feed.url);
}

function isTennisGame(game: Game): boolean {
  return !game.sport || game.sport === 'TENNIS' || game.sport === 'ATP' || game.sport === 'WTA';
}

function isGenericNewsHeadline(title: string): boolean {
  return /power rankings|podcast|betting odds|fantasy tennis|weekly wrap/i.test(title);
}

function findMatchItem(items: RssItem[], game: Game): RssItem | undefined {
  return items.find((item) => {
    const text = `${item.title} ${item.description ?? ''}`;
    if (isGenericNewsHeadline(text)) return false;
    const mentionsAway = textMentionsPlayer(text, game.away.name);
    const mentionsHome = textMentionsPlayer(text, game.home.name);
    if (mentionsAway && mentionsHome) return true;
    if (game.tournamentName && text.toLowerCase().includes(game.tournamentName.toLowerCase())) {
      return mentionsAway || mentionsHome;
    }
    return false;
  });
}

export async function enrichTennisGamesFromRss(games: Game[]): Promise<Game[]> {
  if (!games.length) return games;

  const headlineItems = await loadRssFeedsParallel('tennis-rss-feed', TENNIS_RSS_FEEDS, 20);

  return games.map((game) => {
    if (!isTennisGame(game)) return game;
    const hit = findMatchItem(headlineItems, game);
    if (!hit) return game;
    return enrichGameContext(game, {
      headline: hit.title.slice(0, 100),
      badge: hit.title.slice(0, 40).toUpperCase(),
      priority: Math.max(game.context?.priority ?? 0, 250),
    });
  });
}

/** RSS headlines + WTA headshot enrichment for scoreboard pipeline. */
export async function enrichTennisGames(games: Game[]): Promise<Game[]> {
  let enriched = await enrichTennisGamesFromRss(games);
  enriched = await enrichWtaTennisHeadshots(enriched);
  return enriched;
}

export async function tennisRssCrossCheckTournamentHint(
  tournamentName: string,
  playerName: string,
): Promise<{ headline?: string } | null> {
  for (const feed of TENNIS_RSS_FEEDS) {
    const items = await getFeedItems(feed);
    const hit = items.find((item) => {
      const text = `${item.title} ${item.description ?? ''}`;
      return text.toLowerCase().includes(tournamentName.toLowerCase())
        && textMentionsPlayer(text, playerName);
    });
    if (hit) return { headline: hit.title.slice(0, 100) };
  }
  return null;
}
