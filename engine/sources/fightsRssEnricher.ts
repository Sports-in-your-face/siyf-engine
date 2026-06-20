import { createEngineLog } from '../core/engineUtils';
import { enrichGameContext } from '../core/mergePayload';
import { loadRssFeedsParallel } from '../core/rssFeedCache';
import {
  textMentionsPlayer,
  type RssItem,
} from '../core/rss';
import { isScoreboardNoiseText } from '../../utils/scoreboardNoise';
import type { Game } from '../core/types';

const log = createEngineLog('fights-rss');

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

const FIGHT_ORGS = new Set(['FIGHTS', 'UFC', 'MMA', 'Boxing', 'WBC', 'Bellator', 'PFL']);

function isFightGame(game: Game): boolean {
  const org = game.sport ?? 'FIGHTS';
  return FIGHT_ORGS.has(org);
}

function orgBadge(game: Game): string {
  const org = game.sport ?? game.context?.badge ?? 'FIGHT';
  return String(org).slice(0, 40).toUpperCase();
}

function isGenericNewsHeadline(title: string): boolean {
  return isScoreboardNoiseText(title)
    || /podcast|betting odds|power rankings|weekly wrap|fantasy mma|fantasy boxing/i.test(title);
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
    try {
      if (!isFightGame(game)) return game;

      const hit = findFightItem(headlineItems, game);
      let enriched = game;

      if (hit && !isScoreboardNoiseText(hit.title) && !enriched.context?.headline) {
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
      } else if (!enriched.context?.badge && game.sport) {
        enriched = enrichGameContext(enriched, {
          badge: orgBadge(game),
          priority: Math.max(enriched.context?.priority ?? 0, 250),
        });
      }

      return enriched;
    } catch (err) {
      log('warn', 'enrichFightGamesFromRss', `enrichment failed for ${game.id}`, err);
      return game;
    }
  });
}
