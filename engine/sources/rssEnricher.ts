import { createEngineLog } from '../core/engineUtils';
import { loadRssFeedItems } from '../core/rssFeedCache';
import {
  textMentionsPlayer,
  textMentionsTeam,
  type RssItem,
} from '../core/rss';
import { enrichGameContext } from '../core/mergePayload';
import type { Game, Player, ResolvedTeam } from '../core/types';

export type RssFeedRole =
  | 'context_headline'
  | 'series_crosscheck'
  | 'live_badge'
  | 'player_rumors'
  | 'roster_injuries'
  | 'team_notes'
  | 'series_summary';

interface RssFeedDefinition {
  id: string;
  name: string;
  url: string;
  role: RssFeedRole;
}

export const RSS_FEEDS: RssFeedDefinition[] = [
  { id: 'espn_nba', name: 'ESPN NBA', url: 'https://www.espn.com/espn/rss/nba/news', role: 'context_headline' },
  { id: 'cbs_sports', name: 'CBS Sports NBA', url: 'https://www.cbssports.com/rss/headlines/nba/', role: 'series_crosscheck' },
  { id: 'yahoo_sports', name: 'Yahoo Sports NBA', url: 'https://sports.yahoo.com/nba/rss/', role: 'live_badge' },
  { id: 'hoopsrumors', name: 'HoopsRumors', url: 'https://www.hoopsrumors.com/feed', role: 'player_rumors' },
];

const log = createEngineLog('rss-enricher');

async function getFeedItems(feed: RssFeedDefinition): Promise<RssItem[]> {
  return loadRssFeedItems('rss-feed', feed.id, feed.url);
}

function isNbaGame(game: Game): boolean {
  const s = game.sport;
  if (!s) return true;
  if (s === 'WNBA' || s === 'NCAA') return false;
  return s === 'NBA' || s === 'BASKETBALL';
}

function isGenericNewsHeadline(title: string): boolean {
  return /mvp rankings|power rankings|trade deadline|mock draft|weekly (?:recap|wrap)|rankings:/i.test(title);
}

function isFinalsHeadline(title: string): boolean {
  return /nba finals|finals game \d/i.test(title);
}

function findTeamItem(items: RssItem[], game: Game): RssItem | undefined {
  return items.find((item) => {
    const text = `${item.title} ${item.description ?? ''}`;
    if (isGenericNewsHeadline(text)) return false;
    if (isFinalsHeadline(text) && game.context?.phase !== 'finals') return false;
    return (
      textMentionsTeam(text, game.away.name, game.away.abbr)
      && textMentionsTeam(text, game.home.name, game.home.abbr)
    );
  });
}

export async function enrichGamesFromRss(games: Game[]): Promise<Game[]> {
  if (!games.length) return games;

  const feedsByRole = new Map<RssFeedRole, RssFeedDefinition[]>();
  for (const feed of RSS_FEEDS) {
    if (!feedsByRole.has(feed.role)) feedsByRole.set(feed.role, []);
    feedsByRole.get(feed.role)!.push(feed);
  }

  const headlineFeeds = feedsByRole.get('context_headline') ?? [];
  const badgeFeeds = feedsByRole.get('live_badge') ?? [];
  const summaryFeeds = feedsByRole.get('series_summary') ?? [];

  const feedItems = new Map<string, RssItem[]>();
  await Promise.all(
    RSS_FEEDS.map(async (feed) => {
      feedItems.set(feed.id, await getFeedItems(feed));
    }),
  );

  return games.map((game) => {
      try {
        if (!isNbaGame(game)) return game;
        let enriched = game;

        if (!enriched.context?.headline) {
          for (const feed of headlineFeeds) {
            const items = feedItems.get(feed.id) ?? [];
            const hit = findTeamItem(items, game);
            if (hit) {
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
                badge: 'BREAKING',
                headline: hit.title,
                priority: 400,
              });
              break;
            }
          }
        }

        if (!enriched.context?.seriesSummary) {
          for (const feed of summaryFeeds) {
            const items = feedItems.get(feed.id) ?? [];
            const hit = findTeamItem(items, game);
            if (hit) {
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
        log('warn', 'enrichGamesFromRss', `enrichment failed for ${game.id}`, err);
        return game;
      }
    });
}

export async function rssCrossCheckFromFeeds(
  awayName: string,
  homeName: string,
  awayAbbr: string,
  homeAbbr: string,
): Promise<{ headline?: string; seriesSummary?: string } | null> {
  const feeds = RSS_FEEDS.filter((f) => f.role === 'series_crosscheck');
  for (const feed of feeds) {
    const items = await getFeedItems(feed);
    for (const item of items) {
      const text = `${item.title} ${item.description ?? ''}`;
      const lower = text.toLowerCase();
      const isFinals = /nba finals|finals game|conference finals/i.test(lower);
      const mentions =
        textMentionsTeam(text, awayName, awayAbbr)
        || textMentionsTeam(text, homeName, homeAbbr);
      if (isFinals && mentions) {
        const gameNum = item.title.match(/game\s*(\d+)/i)?.[1];
        const headline = gameNum ? `NBA Finals - Game ${gameNum}` : item.title.slice(0, 60);
        const seriesMatch = item.title.match(/(\d+\s*-\s*\d+)/);
        return {
          headline,
          seriesSummary: seriesMatch?.[1] ? `Series ${seriesMatch[1]}` : undefined,
        };
      }
    }
  }
  return null;
}

export async function fetchPlayerRumors(player: Player): Promise<string[]> {
  const feeds = RSS_FEEDS.filter((f) => f.role === 'player_rumors');
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

export async function enrichRosterWithInjuries(roster: Player[]): Promise<Player[]> {
  const feeds = RSS_FEEDS.filter((f) => f.role === 'roster_injuries');
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

export async function enrichTeamsWithNotes(teams: ResolvedTeam[]): Promise<ResolvedTeam[]> {
  const feeds = RSS_FEEDS.filter((f) => f.role === 'team_notes');
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

