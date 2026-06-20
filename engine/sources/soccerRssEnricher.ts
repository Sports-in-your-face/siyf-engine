import { createEngineLog } from '../core/engineUtils';
import { loadRssFeedItems } from '../core/rssFeedCache';
import {
  textMentionsPlayer,
  textMentionsTeam,
  type RssItem,
} from '../core/rss';

const log = createEngineLog('soccer-rss');
import { enrichGameContext } from '../core/mergePayload';
import type { Game, Player, ResolvedTeam } from '../core/types';

export type SoccerRssFeedRole =
  | 'context_headline'
  | 'match_crosscheck'
  | 'live_badge'
  | 'player_rumors'
  | 'roster_injuries'
  | 'team_notes';

interface SoccerRssFeedDefinition {
  id: string;
  name: string;
  url: string;
  role: SoccerRssFeedRole;
}

export const SOCCER_RSS_FEEDS: SoccerRssFeedDefinition[] = [
  { id: 'espn_soccer', name: 'ESPN FC', url: 'https://www.espn.com/espn/rss/soccer/news', role: 'context_headline' },
  { id: 'cbs_soccer', name: 'CBS Sports Soccer', url: 'https://www.cbssports.com/rss/headlines/soccer/', role: 'context_headline' },
  { id: 'bbc_epl', name: 'BBC Premier League', url: 'https://feeds.bbci.co.uk/sport/football/premier-league/rss.xml', role: 'context_headline' },
  { id: 'bbc_la_liga', name: 'BBC La Liga', url: 'https://feeds.bbci.co.uk/sport/football/spanish-la-liga/rss.xml', role: 'context_headline' },
  { id: 'bbc_bundesliga', name: 'BBC Bundesliga', url: 'https://feeds.bbci.co.uk/sport/football/german-bundesliga/rss.xml', role: 'context_headline' },
  { id: 'bbc_serie_a', name: 'BBC Serie A', url: 'https://feeds.bbci.co.uk/sport/football/italian-serie-a/rss.xml', role: 'context_headline' },
  { id: 'bbc_ligue_1', name: 'BBC Ligue 1', url: 'https://feeds.bbci.co.uk/sport/football/french-ligue-one/rss.xml', role: 'context_headline' },
  { id: 'bbc_mls', name: 'BBC MLS', url: 'https://feeds.bbci.co.uk/sport/football/major-league-soccer/rss.xml', role: 'context_headline' },
  { id: 'bbc_football', name: 'BBC Sport Football', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml', role: 'match_crosscheck' },
  { id: 'transfermarkt', name: 'Transfer News', url: 'https://www.transfermarkt.com/rss/news', role: 'player_rumors' },
  { id: 'guardian_football', name: 'Guardian Football', url: 'https://www.theguardian.com/football/rss', role: 'team_notes' },
  { id: 'yahoo_soccer', name: 'Yahoo Soccer', url: 'https://sports.yahoo.com/soccer/rss/', role: 'live_badge' },
];

async function getFeedItems(feed: SoccerRssFeedDefinition): Promise<RssItem[]> {
  return loadRssFeedItems('soccer-rss-feed', feed.id, feed.url);
}

function isSoccerGame(game: Game): boolean {
  return !game.sport || game.sport === 'SOCCER';
}

function isGenericNewsHeadline(title: string): boolean {
  return /power rankings|transfer window|fantasy|weekly (?:recap|wrap)|rankings:/i.test(title);
}

function findTeamItem(items: RssItem[], game: Game): RssItem | undefined {
  return items.find((item) => {
    const text = `${item.title} ${item.description ?? ''}`;
    if (isGenericNewsHeadline(text)) return false;
    return (
      textMentionsTeam(text, game.away.name, game.away.abbr)
      && textMentionsTeam(text, game.home.name, game.home.abbr)
    );
  });
}

export async function enrichSoccerGamesFromRss(games: Game[]): Promise<Game[]> {
  if (!games.length) return games;

  const feedsByRole = new Map<SoccerRssFeedRole, SoccerRssFeedDefinition[]>();
  for (const feed of SOCCER_RSS_FEEDS) {
    if (!feedsByRole.has(feed.role)) feedsByRole.set(feed.role, []);
    feedsByRole.get(feed.role)!.push(feed);
  }

  const headlineFeeds = feedsByRole.get('context_headline') ?? [];
  const badgeFeeds = feedsByRole.get('live_badge') ?? [];
  const summaryFeeds = feedsByRole.get('team_notes') ?? [];

  const feedItems = new Map<string, RssItem[]>();
  await Promise.all(
    SOCCER_RSS_FEEDS.map(async (feed) => {
      feedItems.set(feed.id, await getFeedItems(feed));
    }),
  );

  return games.map((game) => {
      try {
        if (!isSoccerGame(game)) return game;
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
        log('warn', 'enrichSoccerGamesFromRss', `enrichment failed for ${game.id}`, err);
        return game;
      }
    });
}

export async function soccerRssCrossCheckMatchHint(
  awayName: string,
  homeName: string,
): Promise<{ headline?: string } | null> {
  const feeds = SOCCER_RSS_FEEDS.filter((f) => f.role === 'match_crosscheck');
  for (const feed of feeds) {
    const items = await getFeedItems(feed);
    for (const item of items) {
      const text = `${item.title} ${item.description ?? ''}`;
      const mentions =
        textMentionsTeam(text, awayName, '')
        || textMentionsTeam(text, homeName, '');
      if (mentions && /champions league|semi.?final|final|derby|knockout/i.test(text)) {
        return { headline: item.title.slice(0, 80) };
      }
    }
  }
  return null;
}

export async function fetchSoccerPlayerRumors(player: Player): Promise<string[]> {
  const feeds = SOCCER_RSS_FEEDS.filter((f) => f.role === 'player_rumors');
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

export async function enrichSoccerRosterWithInjuries(roster: Player[]): Promise<Player[]> {
  const feeds = SOCCER_RSS_FEEDS.filter((f) => f.role === 'roster_injuries');
  if (!feeds.length) return roster;

  const injuryItems: RssItem[] = [];
  for (const feed of feeds) {
    injuryItems.push(...(await getFeedItems(feed)).slice(0, 30));
  }

  return roster.map((player) => {
    const hit = injuryItems.find((item) => {
      const text = `${item.title} ${item.description ?? ''}`.toLowerCase();
      return textMentionsPlayer(text, player.name) && /out|injury|doubtful|suspended|ruled out|knock/i.test(text);
    });
    if (!hit) return player;
    return {
      ...player,
      position: player.position.includes('·') ? player.position : `${player.position} · ${hit.title.slice(0, 40)}`,
    };
  });
}

export async function enrichSoccerTeamsWithNotes(teams: ResolvedTeam[]): Promise<ResolvedTeam[]> {
  const feeds = SOCCER_RSS_FEEDS.filter((f) => f.role === 'team_notes');
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

