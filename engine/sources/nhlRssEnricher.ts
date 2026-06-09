import { enrichGameContext } from '../core/mergePayload';
import { loadRssFeedItems, loadRssFeedsParallel } from '../core/rssFeedCache';
import {
  textMentionsPlayer,
  textMentionsTeam,
  type RssItem,
} from '../core/rss';
import type { Game, Player, ResolvedTeam } from '../core/types';

export type NhlRssFeedRole =
  | 'context_headline'
  | 'playoff_crosscheck'
  | 'live_badge'
  | 'player_rumors'
  | 'roster_injuries'
  | 'team_notes';

interface NhlRssFeedDefinition {
  id: string;
  name: string;
  url: string;
  role: NhlRssFeedRole;
}

export const NHL_RSS_FEEDS: NhlRssFeedDefinition[] = [
  { id: 'espn_nhl', name: 'ESPN NHL', url: 'https://www.espn.com/espn/rss/nhl/news', role: 'context_headline' },
  { id: 'cbs_nhl', name: 'CBS Sports NHL', url: 'https://www.cbssports.com/rss/headlines/nhl/', role: 'playoff_crosscheck' },
  { id: 'yahoo_nhl', name: 'Yahoo Sports NHL', url: 'https://sports.yahoo.com/nhl/rss/', role: 'live_badge' },
  { id: 'rotoworld_nhl', name: 'Rotoworld NHL', url: 'https://www.nbcsportsedge.com/rss/nhl', role: 'roster_injuries' },
  { id: 'tsn_nhl', name: 'TSN NHL', url: 'https://www.tsn.ca/rss/nhl', role: 'team_notes' },
];

async function getFeedItems(feed: NhlRssFeedDefinition): Promise<RssItem[]> {
  return loadRssFeedItems('nhl-rss-feed', feed.id, feed.url);
}

function isNhlGame(game: Game): boolean {
  return !game.sport || game.sport === 'HOCKEY' || game.sport === 'NHL';
}

function isGenericNewsHeadline(title: string): boolean {
  return /power rankings|mock draft|weekly (?:recap|wrap)|rankings:|fantasy hockey/i.test(title);
}

function isPlayoffHeadline(title: string): boolean {
  return /stanley cup|playoffs?|conference finals|semifinals?/i.test(title);
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

export async function enrichNhlGamesFromRss(games: Game[]): Promise<Game[]> {
  if (!games.length) return games;

  const feedsByRole = new Map<NhlRssFeedRole, NhlRssFeedDefinition[]>();
  for (const feed of NHL_RSS_FEEDS) {
    if (!feedsByRole.has(feed.role)) feedsByRole.set(feed.role, []);
    feedsByRole.get(feed.role)!.push(feed);
  }

  const headlineFeeds = feedsByRole.get('context_headline') ?? [];
  const headlineItems = await loadRssFeedsParallel('nhl-rss-feed', headlineFeeds, 25);

  return games.map((game) => {
    if (!isNhlGame(game)) return game;
    const hit = findTeamItem(headlineItems, game);
    if (!hit) return game;
    return enrichGameContext(game, {
      headline: hit.title.slice(0, 100),
      badge: hit.title.slice(0, 40).toUpperCase(),
      priority: 250,
    });
  });
}

export async function enrichNhlRosterWithInjuries(roster: Player[]): Promise<Player[]> {
  const feeds = NHL_RSS_FEEDS.filter((f) => f.role === 'roster_injuries');
  if (!feeds.length) return roster;

  const injuryItems: RssItem[] = [];
  for (const feed of feeds) injuryItems.push(...(await getFeedItems(feed)).slice(0, 30));

  return roster.map((player) => {
    const hit = injuryItems.find((item) => {
      const text = `${item.title} ${item.description ?? ''}`.toLowerCase();
      return textMentionsPlayer(text, player.name) && /out|injury|questionable|doubtful|gtd|inactive|day-to-day/i.test(text);
    });
    if (!hit) return player;
    return {
      ...player,
      position: player.position.includes('·') ? player.position : `${player.position} · ${hit.title.slice(0, 40)}`,
    };
  });
}

export async function enrichNhlTeamsWithNotes(teams: ResolvedTeam[]): Promise<ResolvedTeam[]> {
  const feeds = NHL_RSS_FEEDS.filter((f) => f.role === 'team_notes');
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

export async function nhlRssCrossCheckPlayoffHint(away: string, home: string): Promise<{ headline?: string } | null> {
  const feeds = NHL_RSS_FEEDS.filter((f) => f.role === 'playoff_crosscheck');
  for (const feed of feeds) {
    const items = await getFeedItems(feed);
    const hit = items.find((item) => {
      const text = `${item.title} ${item.description ?? ''}`;
      return isPlayoffHeadline(text)
        && textMentionsTeam(text, away, '')
        && textMentionsTeam(text, home, '');
    });
    if (hit) return { headline: hit.title.slice(0, 100) };
  }
  return null;
}
