import { createEngineLog } from '../core/engineUtils';
import { loadRssFeedItems } from '../core/rssFeedCache';
import {
  textMentionsPlayer,
  textMentionsTeam,
  type RssItem,
} from '../core/rss';

const log = createEngineLog('mlb-rss');
import { enrichGameContext } from '../core/mergePayload';
import type { Game, Player, ResolvedTeam } from '../core/types';

export type MlbRssFeedRole =
  | 'context_headline'
  | 'playoff_crosscheck'
  | 'live_badge'
  | 'player_rumors'
  | 'roster_injuries'
  | 'team_notes';

interface MlbRssFeedDefinition {
  id: string;
  name: string;
  url: string;
  role: MlbRssFeedRole;
}

export const MLB_RSS_FEEDS: MlbRssFeedDefinition[] = [
  { id: 'espn_mlb', name: 'ESPN MLB', url: 'https://www.espn.com/espn/rss/mlb/news', role: 'context_headline' },
  { id: 'mlb_com', name: 'MLB.com', url: 'https://www.mlb.com/feeds/news/rss.xml', role: 'team_notes' },
  { id: 'cbs_mlb', name: 'CBS Sports MLB', url: 'https://www.cbssports.com/rss/headlines/mlb/', role: 'playoff_crosscheck' },
  { id: 'yahoo_mlb', name: 'Yahoo Sports MLB', url: 'https://sports.yahoo.com/mlb/rss/', role: 'live_badge' },
  { id: 'mlbtr', name: 'MLB Trade Rumors', url: 'https://www.mlbtraderumors.com/feed', role: 'player_rumors' },
  { id: 'rotoworld_mlb', name: 'Rotoworld MLB', url: 'https://www.nbcsportsedge.com/rss/mlb', role: 'roster_injuries' },
];

async function getFeedItems(feed: MlbRssFeedDefinition): Promise<RssItem[]> {
  return loadRssFeedItems('mlb-rss-feed', feed.id, feed.url);
}

function isMlbGame(game: Game): boolean {
  return !game.sport || game.sport === 'BASEBALL' || game.sport === 'MLB';
}

function isGenericNewsHeadline(title: string): boolean {
  return /power rankings|mock draft|weekly (?:recap|wrap)|rankings:|fantasy baseball/i.test(title);
}

function isPlayoffHeadline(title: string): boolean {
  return /world series|wild.?card|division series|league championship|alcs|nlcs|alds|nlds|playoffs?/i.test(title);
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

export async function enrichMlbGamesFromRss(games: Game[]): Promise<Game[]> {
  if (!games.length) return games;

  const feedsByRole = new Map<MlbRssFeedRole, MlbRssFeedDefinition[]>();
  for (const feed of MLB_RSS_FEEDS) {
    if (!feedsByRole.has(feed.role)) feedsByRole.set(feed.role, []);
    feedsByRole.get(feed.role)!.push(feed);
  }

  const headlineFeeds = feedsByRole.get('context_headline') ?? [];
  const badgeFeeds = feedsByRole.get('live_badge') ?? [];
  const summaryFeeds = feedsByRole.get('team_notes') ?? [];

  const feedItems = new Map<string, RssItem[]>();
  await Promise.all(
    MLB_RSS_FEEDS.map(async (feed) => {
      feedItems.set(feed.id, await getFeedItems(feed));
    }),
  );

  return games.map((game) => {
      try {
        if (!isMlbGame(game)) return game;
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
                badge: 'LIVE',
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
        log('warn', 'enrichMlbGamesFromRss', `enrichment failed for ${game.id}`, err);
        return game;
      }
    });
}

export async function mlbRssCrossCheckPlayoffHint(
  awayName: string,
  homeName: string,
): Promise<{ headline?: string; seriesSummary?: string } | null> {
  const feeds = MLB_RSS_FEEDS.filter((f) => f.role === 'playoff_crosscheck');
  for (const feed of feeds) {
    const items = await getFeedItems(feed);
    for (const item of items) {
      const text = `${item.title} ${item.description ?? ''}`;
      const lower = text.toLowerCase();
      const isPlayoff = /world series|wild.?card|division series|league championship|alcs|nlcs|playoffs?/i.test(lower);
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

export async function fetchMlbPlayerRumors(player: Player): Promise<string[]> {
  const feeds = MLB_RSS_FEEDS.filter((f) => f.role === 'player_rumors');
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

export async function enrichMlbRosterWithInjuries(roster: Player[]): Promise<Player[]> {
  const feeds = MLB_RSS_FEEDS.filter((f) => f.role === 'roster_injuries');
  if (!feeds.length) return roster;

  const injuryItems: RssItem[] = [];
  for (const feed of feeds) {
    injuryItems.push(...(await getFeedItems(feed)).slice(0, 30));
  }

  return roster.map((player) => {
    const hit = injuryItems.find((item) => {
      const text = `${item.title} ${item.description ?? ''}`.toLowerCase();
      return textMentionsPlayer(text, player.name) && /out|injury|questionable|doubtful|il|disabled list|inactive|ruled out/i.test(text);
    });
    if (!hit) return player;
    return {
      ...player,
      position: player.position.includes('·') ? player.position : `${player.position} · ${hit.title.slice(0, 40)}`,
    };
  });
}

export async function enrichMlbTeamsWithNotes(teams: ResolvedTeam[]): Promise<ResolvedTeam[]> {
  const feeds = MLB_RSS_FEEDS.filter((f) => f.role === 'team_notes');
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

