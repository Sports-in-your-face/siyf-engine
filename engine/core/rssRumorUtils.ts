import type { PlayerRumor } from '../../types';
import { textMentionsPlayer, type RssItem } from './rss';
import type { Player } from '../../types';

export function formatRumorDate(pubDate?: string): string | undefined {
  if (!pubDate) return undefined;
  const parsed = new Date(pubDate);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function mapRssRumorItem(item: RssItem, source: string): PlayerRumor {
  return {
    headline: item.title,
    url: item.link,
    source,
    date: formatRumorDate(item.pubDate),
  };
}

export function injuryStatusFromRssTitle(title: string): string {
  const t = title.toLowerCase();
  if (/ruled out|will not play|out indefinitely|placed on il|on ir\b|inactive|expected to miss|out for/i.test(t)) {
    return 'Out';
  }
  if (/questionable/i.test(t)) return 'Questionable';
  if (/doubtful/i.test(t)) return 'Doubtful';
  if (/probable|expected to play/i.test(t)) return 'Probable';
  if (/day-to-day|day to day/i.test(t)) return 'Day-to-Day';
  if (/suspended/i.test(t)) return 'Suspended';
  return title.length > 48 ? `${title.slice(0, 45)}…` : title;
}

export function dedupeRumors(rumors: (string | PlayerRumor)[]): PlayerRumor[] {
  const out: PlayerRumor[] = [];
  const seen = new Set<string>();
  for (const r of rumors) {
    const rumor = typeof r === 'string' ? { headline: r } : r;
    const key = rumor.headline.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(rumor);
  }
  return out.slice(0, 5);
}

export function applyRosterInjuriesFromItems(roster: Player[], injuryItems: RssItem[]): Player[] {
  return roster.map((player) => {
    const hit = injuryItems.find((item) => {
      const text = `${item.title} ${item.description ?? ''}`.toLowerCase();
      return textMentionsPlayer(text, player.name)
        && /out|injury|questionable|doubtful|gtd|inactive|ruled out|day-to-day|il|disabled list|suspended|knock/i.test(text);
    });
    if (!hit || player.injuryStatus) return player;
    return { ...player, injuryStatus: injuryStatusFromRssTitle(hit.title) };
  });
}
