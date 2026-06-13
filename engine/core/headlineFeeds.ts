/**
 * Page-level headline feeds for free/guest and premium tiers.
 * Feed URLs align with sport RSS enrichers; filters mirror enricher headline quality gates.
 */

export type HeadlineLeague = 'NBA' | 'NFL' | 'NHL' | 'MLB' | 'MLS' | 'Tennis' | 'Golf' | 'Fights';

export interface HeadlineFeedDef {
  id: string;
  name: string;
  url: string;
}

export interface HeadlineFeedConfig {
  free: HeadlineFeedDef[];
  premium: HeadlineFeedDef[];
}

export interface HeadlineItem {
  title: string;
  description?: string;
  link?: string;
  pubDate?: string;
  feedName?: string;
  tier?: 'free' | 'premium';
  source?: string;
}

export const FREE_HEADLINE_LIMIT = 5;
export const PREMIUM_HEADLINE_LIMIT = 12;

export const HEADLINE_FEEDS: Record<HeadlineLeague, HeadlineFeedConfig> = {
  NBA: {
    free: [
      { id: 'espn_nba', name: 'ESPN', url: 'https://www.espn.com/espn/rss/nba/news' },
      { id: 'cbs_nba', name: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/nba/' },
    ],
    premium: [
      { id: 'yahoo_nba', name: 'Yahoo Sports', url: 'https://sports.yahoo.com/nba/rss/' },
      { id: 'hoopsrumors', name: 'HoopsRumors', url: 'https://www.hoopsrumors.com/feed' },
    ],
  },
  NFL: {
    free: [
      { id: 'espn_nfl', name: 'ESPN', url: 'https://www.espn.com/espn/rss/nfl/news' },
      { id: 'cbs_nfl', name: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/nfl/' },
    ],
    premium: [
      { id: 'yahoo_nfl', name: 'Yahoo Sports', url: 'https://sports.yahoo.com/nfl/rss/' },
      { id: 'pft', name: 'Pro Football Talk', url: 'https://profootballtalk.nbcsports.com/feed/' },
    ],
  },
  NHL: {
    free: [
      { id: 'espn_nhl', name: 'ESPN', url: 'https://www.espn.com/espn/rss/nhl/news' },
      { id: 'cbs_nhl', name: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/nhl/' },
    ],
    premium: [
      { id: 'yahoo_nhl', name: 'Yahoo Sports', url: 'https://sports.yahoo.com/nhl/rss/' },
      { id: 'tsn_nhl', name: 'TSN', url: 'https://www.tsn.ca/rss/nhl' },
    ],
  },
  MLB: {
    free: [
      { id: 'espn_mlb', name: 'ESPN', url: 'https://www.espn.com/espn/rss/mlb/news' },
      { id: 'mlb_com', name: 'MLB.com', url: 'https://www.mlb.com/feeds/news/rss.xml' },
      { id: 'cbs_mlb', name: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/mlb/' },
    ],
    premium: [
      { id: 'yahoo_mlb', name: 'Yahoo Sports', url: 'https://sports.yahoo.com/mlb/rss/' },
      { id: 'mlbtr', name: 'MLB Trade Rumors', url: 'https://www.mlbtraderumors.com/feed' },
    ],
  },
  MLS: {
    free: [
      { id: 'espn_soccer', name: 'ESPN FC', url: 'https://www.espn.com/espn/rss/soccer/news' },
      { id: 'cbs_soccer', name: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/soccer/' },
    ],
    premium: [
      { id: 'bbc_football', name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml' },
      { id: 'guardian_football', name: 'The Guardian', url: 'https://www.theguardian.com/football/rss' },
    ],
  },
  Tennis: {
    free: [
      { id: 'espn_tennis', name: 'ESPN', url: 'https://www.espn.com/espn/rss/tennis/news' },
      { id: 'yahoo_tennis', name: 'Yahoo Sports', url: 'https://sports.yahoo.com/tennis/rss/' },
    ],
    premium: [],
  },
  Golf: {
    free: [
      { id: 'espn_golf', name: 'ESPN', url: 'https://www.espn.com/espn/rss/golf/news' },
      { id: 'golf_com', name: 'Golf.com', url: 'https://golf.com/feed/' },
    ],
    premium: [
      { id: 'yahoo_golf', name: 'Yahoo Sports', url: 'https://sports.yahoo.com/golf/rss/' },
    ],
  },
  Fights: {
    free: [
      { id: 'espn_mma', name: 'ESPN MMA', url: 'https://www.espn.com/espn/rss/mma/news' },
      { id: 'espn_boxing', name: 'ESPN Boxing', url: 'https://www.espn.com/espn/rss/boxing/news' },
    ],
    premium: [
      { id: 'yahoo_mma', name: 'Yahoo MMA', url: 'https://sports.yahoo.com/mma/rss/' },
    ],
  },
};

const LEAGUE_ALIASES: Record<string, HeadlineLeague> = {
  nba: 'NBA',
  nfl: 'NFL',
  nhl: 'NHL',
  mlb: 'MLB',
  mls: 'MLS',
  soccer: 'MLS',
  tennis: 'Tennis',
  golf: 'Golf',
  fights: 'Fights',
  mma: 'Fights',
  ufc: 'Fights',
};

export function normalizeHeadlineLeague(league: string): HeadlineLeague {
  const key = league?.trim() || 'NBA';
  if (key in HEADLINE_FEEDS) return key as HeadlineLeague;
  return LEAGUE_ALIASES[key.toLowerCase()] ?? 'NBA';
}

function headlineText(item: HeadlineItem): string {
  return `${item.title} ${item.description ?? ''}`.trim();
}

const GENERIC_PATTERNS: Record<HeadlineLeague, RegExp> = {
  NBA: /mvp rankings|power rankings|trade deadline|mock draft|weekly (?:recap|wrap)|rankings:|fantasy basketball|podcast/i,
  NFL: /power rankings|mock draft|weekly (?:recap|wrap)|rankings:|fantasy football|podcast/i,
  NHL: /power rankings|mock draft|weekly (?:recap|wrap)|rankings:|fantasy hockey|podcast/i,
  MLB: /power rankings|mock draft|weekly (?:recap|wrap)|rankings:|fantasy baseball|podcast/i,
  MLS: /power rankings|transfer window|fantasy|weekly (?:recap|wrap)|rankings:|podcast/i,
  Tennis: /power rankings|podcast|betting odds|fantasy tennis|weekly wrap/i,
  Golf: /podcast|betting odds|fantasy golf|equipment review|instruction/i,
  Fights: /podcast|betting odds|power rankings|weekly wrap|fantasy/i,
};

/** Non-MLS soccer leagues / topics to drop on the MLS page. */
const NON_MLS_SOCCER =
  /premier league|la liga|bundesliga|serie a|ligue 1|champions league|europa league|conference league|world cup|euro 20|fa cup|carabao cup|copa del rey|dfb-pokal|coppa italia|ligue 2|eredivisie|primeira liga|scottish premiership|super lig|mls next pro/i;

const MLS_SIGNAL =
  /\bmls\b|mls cup|mls playoffs|inter miami|la galaxy|l\.a\. galaxy|lafc|sounders|timbers|red bulls|philadelphia union|revolution|crew|fc dallas|sporting kc|nashville sc|austin fc|charlotte fc|st\. louis city|cf montreal|toronto fc|whitecaps|impact|fc cincinnati|orlando city|new york city fc|nycfc|dc united|chicago fire|colorado rapids|real salt lake|minnesota united|san jose earthquakes|houston dynamo|atlanta united|new england revolution/i;

const OTHER_SPORT_BLEED: Partial<Record<HeadlineLeague, RegExp>> = {
  NBA: /\b(?:nfl draft|super bowl|world series|stanley cup|premier league|ufc \d|wimbledon|masters tournament)\b/i,
  NFL: /\b(?:nba finals|world series|stanley cup|premier league|wimbledon|masters tournament|ufl\b|united football league)\b/i,
  NHL: /\b(?:nba finals|super bowl|world series|premier league|wimbledon|masters tournament)\b/i,
  MLB: /\b(?:nba finals|super bowl|stanley cup|premier league|ufc \d|wimbledon)\b/i,
  Tennis: /\b(?:nba |nfl |mlb |nhl |mls |ufc \d|super bowl|world series)\b/i,
  Golf: /\b(?:nba |nfl |mlb |nhl |mls |ufc \d|super bowl|wimbledon)\b/i,
  Fights: /\b(?:nba finals|super bowl|world series|stanley cup|premier league|wimbledon|masters tournament)\b/i,
};

export function isGenericHeadline(league: HeadlineLeague, text: string): boolean {
  return GENERIC_PATTERNS[league].test(text);
}

export function isRelevantHeadline(league: HeadlineLeague, text: string): boolean {
  if (league === 'MLS') {
    if (NON_MLS_SOCCER.test(text)) return false;
    return MLS_SIGNAL.test(text);
  }

  if (league === 'Fights') {
    if (/\b(?:wwe|aew|impact wrestling|pro wrestling)\b/i.test(text)) return false;
    return true;
  }

  const bleed = OTHER_SPORT_BLEED[league];
  if (bleed?.test(text)) return false;

  return true;
}

function normalizeTitleKey(title: string): string {
  return title.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function filterHeadlinesForLeague(league: HeadlineLeague, items: HeadlineItem[]): HeadlineItem[] {
  const seen = new Set<string>();
  const out: HeadlineItem[] = [];

  for (const item of items) {
    const text = headlineText(item);
    if (!text || text.length < 12) continue;
    if (isGenericHeadline(league, text)) continue;
    if (!isRelevantHeadline(league, text)) continue;

    const key = normalizeTitleKey(item.title);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}
