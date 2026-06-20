import { createEngineLog } from '../core/engineUtils';
import { enrichGameContext } from '../core/mergePayload';
import { loadRssFeedItems, loadRssFeedMap } from '../core/rssFeedCache';
import {
  textMentionsPlayer,
  textMentionsTeam,
  type RssItem,
} from '../core/rss';
import { isScoreboardNoiseText } from '../../utils/scoreboardNoise';
import type { Game, Player, ResolvedTeam } from '../core/types';

const log = createEngineLog('nfl-rss');

export type NflRssFeedRole =
  | 'context_headline'
  | 'playoff_crosscheck'
  | 'live_badge'
  | 'player_rumors'
  | 'roster_injuries'
  | 'team_notes';

interface NflRssFeedDefinition {
  id: string;
  name: string;
  url: string;
  role: NflRssFeedRole;
}

export const NFL_RSS_FEEDS: NflRssFeedDefinition[] = [
  { id: 'espn_nfl', name: 'ESPN NFL', url: 'https://www.espn.com/espn/rss/nfl/news', role: 'context_headline' },
  { id: 'cbs_nfl', name: 'CBS Sports NFL', url: 'https://www.cbssports.com/rss/headlines/nfl/', role: 'playoff_crosscheck' },
  { id: 'yahoo_nfl', name: 'Yahoo Sports NFL', url: 'https://sports.yahoo.com/nfl/rss/', role: 'live_badge' },
  { id: 'pft', name: 'Pro Football Talk', url: 'https://profootballtalk.nbcsports.com/feed/', role: 'player_rumors' },
];

async function getFeedItems(feed: NflRssFeedDefinition): Promise<RssItem[]> {
  return loadRssFeedItems('nfl-rss-feed', feed.id, feed.url);
}

function isNflGame(game: Game): boolean {
  return !game.sport || game.sport === 'FOOTBALL' || game.sport === 'NFL';
}

function isGenericNewsHeadline(title: string): boolean {
  return isScoreboardNoiseText(title)
    || /power rankings|mock draft|weekly (?:recap|wrap)|rankings:|fantasy football/i.test(title);
}

function isPlayoffHeadline(title: string): boolean {
  return /super bowl|wild.?card|divisional|conference championship|playoffs?/i.test(title);
}

function findTeamItem(items: RssItem[], game: Game): RssItem | undefined {
  return items.find((item) => {
    const text = `${item.title} ${item.description ?? ''}`;
    if (isGenericNewsHeadline(text)) return false;
    if (isPlayoffHeadline(text) && game.context?.phase !== 'playoffs' && game.context?.phase !== 'finals') return false;
    return (
      textMentionsTeam(text, game.away.name, game.away.abbr)
      && textMentionsTeam(text, game.home.name, game.home.abbr)
    );
  });
}

export async function enrichNflGamesFromRss(games: Game[]): Promise<Game[]> {
  if (!games.length) return games;

  const feedsByRole = new Map<NflRssFeedRole, NflRssFeedDefinition[]>();
  for (const feed of NFL_RSS_FEEDS) {
    if (!feedsByRole.has(feed.role)) feedsByRole.set(feed.role, []);
    feedsByRole.get(feed.role)!.push(feed);
  }

  const headlineFeeds = feedsByRole.get('context_headline') ?? [];
  const badgeFeeds = feedsByRole.get('live_badge') ?? [];
  const summaryFeeds = feedsByRole.get('team_notes') ?? [];

  const feedItems = await loadRssFeedMap('nfl-rss-feed', NFL_RSS_FEEDS);

  return games.map((game) => {
      try {
        if (!isNflGame(game)) return game;
        let enriched = game;

        if (!enriched.context?.headline) {
          for (const feed of headlineFeeds) {
            const items = feedItems.get(feed.id) ?? [];
            const hit = findTeamItem(items, game);
            if (hit && !isScoreboardNoiseText(hit.title)) {
              enriched = enrichGameContext(enriched, {
                headline: hit.title,
                priority: 300,
              });
              break;
            }
          }
        }

        if (game.statusState === 'in' && !enriched.context?.badge) {
          for (const feed of badgeFeeds) {
            const items = feedItems.get(feed.id) ?? [];
            const hit = findTeamItem(items, game);
            if (hit) {
              enriched = enrichGameContext(enriched, {
                badge: 'LIVE',
                priority: 400,
              });
              break;
            }
          }
        }

        if (
          !enriched.context?.seriesSummary
          && (game.context?.phase === 'playoffs' || game.context?.phase === 'finals')
        ) {
          for (const feed of summaryFeeds) {
            const items = feedItems.get(feed.id) ?? [];
            const hit = findTeamItem(items, game);
            if (hit && !isScoreboardNoiseText(hit.title)) {
              enriched = enrichGameContext(enriched, {
                seriesSummary: hit.title.slice(0, 120),
                priority: 250,
              });
              break;
            }
          }
        }

        return enriched;
      } catch (err) {
        log('warn', 'enrichNflGamesFromRss', `enrichment failed for ${game.id}`, err);
        return game;
      }
    });
}

export async function nflRssCrossCheckPlayoffHint(
  awayName: string,
  homeName: string,
): Promise<{ headline?: string; seriesSummary?: string } | null> {
  const feeds = NFL_RSS_FEEDS.filter((f) => f.role === 'playoff_crosscheck');
  for (const feed of feeds) {
    const items = await getFeedItems(feed);
    for (const item of items) {
      const text = `${item.title} ${item.description ?? ''}`;
      if (isScoreboardNoiseText(item.title)) continue;
      const lower = text.toLowerCase();
      const isPlayoff = /super bowl|wild.?card|divisional|conference championship|playoffs?/i.test(lower);
      const mentions =
        textMentionsTeam(text, awayName, '')
        || textMentionsTeam(text, homeName, '');
      if (isPlayoff && mentions) {
        return { headline: item.title.slice(0, 80) };
      }
    }
  }
  return null;
}

export async function fetchNflPlayerRumors(player: Player): Promise<string[]> {
  const feeds = NFL_RSS_FEEDS.filter((f) => f.role === 'player_rumors');
  const rumors: string[] = [];
  for (const feed of feeds) {
    const items = await getFeedItems(feed);
    for (const item of items) {
      const text = `${item.title} ${item.description ?? ''}`;
      if (textMentionsPlayer(text, player.name)) rumors.push(item.title);
    }
  }
  return rumors.slice(0, 3);
}

export async function enrichNflRosterWithInjuries(roster: Player[]): Promise<Player[]> {
  const feeds = NFL_RSS_FEEDS.filter((f) => f.role === 'roster_injuries');
  if (!feeds.length) return roster;

  const injuryItems: RssItem[] = [];
  for (const feed of feeds) {
    injuryItems.push(...(await getFeedItems(feed)).slice(0, 30));
  }

  return roster.map((player) => {
    const hit = injuryItems.find((item) => {
      const text = `${item.title} ${item.description ?? ''}`.toLowerCase();
      return textMentionsPlayer(text, player.name) && /out|injury|questionable|doubtful|gtd|inactive|ruled out/i.test(text);
    });
    if (!hit) return player;
    return {
      ...player,
      position: player.position.includes('·') ? player.position : `${player.position} · ${hit.title.slice(0, 40)}`,
    };
  });
}

export async function enrichNflTeamsWithNotes(teams: ResolvedTeam[]): Promise<ResolvedTeam[]> {
  const feeds = NFL_RSS_FEEDS.filter((f) => f.role === 'team_notes');
  if (!feeds.length) return teams;

  const notes = new Map<string, string>();
  for (const feed of feeds) {
    const items = await getFeedItems(feed);
    for (const item of items) {
      for (const team of teams) {
        if (notes.has(team.abbr)) continue;
        const text = `${item.title} ${item.description ?? ''}`;
        if (textMentionsTeam(text, team.name, team.abbr)) {
          notes.set(team.abbr, item.title.slice(0, 100));
        }
      }
    }
  }

  return teams.map((t) => (notes.has(t.abbr) ? { ...t, note: notes.get(t.abbr) } : t));
}

