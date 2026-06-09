import { loadRssFeedsParallel } from '../core/rssFeedCache';
import {
  textMentionsPlayer,
  type RssItem,
} from '../core/rss';
import { enrichGameContext } from '../core/mergePayload';
import type { Game } from '../core/types';

interface FightsRssFeedDefinition {
  id: string;
  name: string;
  url: string;
}

export const FIGHTS_RSS_FEEDS: FightsRssFeedDefinition[] = [
  { id: 'espn_mma', name: 'ESPN MMA', url: 'https://www.espn.com/espn/rss/mma/news' },
  { id: 'espn_boxing', name: 'ESPN Boxing', url: 'https://www.espn.com/espn/rss/boxing/news' },
  { id: 'yahoo_mma', name: 'Yahoo MMA', url: 'https://sports.yahoo.com/mma/rss/' },
];

function isFightGame(game: Game): boolean {
  const org = game.sport ?? '';
  return ['UFC', 'Bellator', 'PFL', 'Boxing', 'FIGHTS'].includes(org);
}

function isGenericNewsHeadline(title: string): boolean {
  return /podcast|betting odds|power rankings|weekly wrap|fantasy/i.test(title);
}

function findFightItem(items: RssItem[], game: Game): RssItem | undefined {
  return items.find((item) => {
    const text = `${item.title} ${item.description ?? ''}`;
    if (isGenericNewsHeadline(text)) return false;
    const mentionsAway = textMentionsPlayer(text, game.away.name);
    const mentionsHome = textMentionsPlayer(text, game.home.name);
    if (mentionsAway && mentionsHome) return true;
    const card = game.tournamentName ?? game.subtitle ?? '';
    if (card && text.toLowerCase().includes(card.toLowerCase().slice(0, 24))) {
      return mentionsAway || mentionsHome;
    }
    return false;
  });
}

export async function enrichFightGamesFromRss(games: Game[]): Promise<Game[]> {
  if (!games.length) return games;

  const headlineItems = await loadRssFeedsParallel('fights-rss-feed', FIGHTS_RSS_FEEDS, 20);

  return games.map((game) => {
    if (!isFightGame(game)) return game;
    const hit = findFightItem(headlineItems, game);
    if (!hit) return game;
    return enrichGameContext(game, {
      headline: hit.title.slice(0, 100),
      badge: (game.context?.badge ?? game.sport ?? 'FIGHT').toString().slice(0, 40).toUpperCase(),
      priority: Math.max(game.context?.priority ?? 0, 280),
    });
  });
}
