import { createEngineLog } from '../core/engineUtils';
import { enrichGameContext } from '../core/mergePayload';
import { loadRssFeedItems, loadRssFeedsParallel } from '../core/rssFeedCache';
import {
  textMentionsPlayer,
  type RssItem,
} from '../core/rss';
import { isScoreboardNoiseText } from '../../utils/scoreboardNoise';
import type { Game } from '../core/types';
import { enrichWtaTennisHeadshots } from './wtaTennisSource';

const log = createEngineLog('tennis-rss');

interface TennisRssFeedDefinition {
  id: string;
  name: string;
  url: string;
}

export const TENNIS_RSS_FEEDS: TennisRssFeedDefinition[] = [
  { id: 'espn_tennis', name: 'ESPN Tennis', url: 'https://www.espn.com/espn/rss/tennis/news' },
  { id: 'yahoo_tennis', name: 'Yahoo Tennis', url: 'https://sports.yahoo.com/tennis/rss/' },
];

async function getFeedItems(feed: TennisRssFeedDefinition): Promise<RssItem[]> {
  return loadRssFeedItems('tennis-rss-feed', feed.id, feed.url);
}

function isTennisGame(game: Game): boolean {
  return !game.sport || game.sport === 'TENNIS' || game.sport === 'ATP' || game.sport === 'WTA';
}

function isGenericNewsHeadline(title: string): boolean {
  return isScoreboardNoiseText(title)
    || /power rankings|podcast|betting odds|fantasy tennis|weekly wrap/i.test(title);
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
    try {
      if (!isTennisGame(game)) return game;
      const hit = findMatchItem(headlineItems, game);
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
      log('warn', 'enrichTennisGamesFromRss', `enrichment failed for ${game.id}`, err);
      return game;
    }
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
      if (isScoreboardNoiseText(item.title)) return false;
      const text = `${item.title} ${item.description ?? ''}`;
      return text.toLowerCase().includes(tournamentName.toLowerCase())
        && textMentionsPlayer(text, playerName);
    });
    if (hit) return { headline: hit.title.slice(0, 100) };
  }
  return null;
}
