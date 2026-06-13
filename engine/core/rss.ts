import { externalFetchUrl } from '../../config/siyfApi';
import { dedupeRequest, fetchJsonResilient } from './resilientFetch';
import { cacheGet, cacheKey, cacheSet } from './cache';

export interface RssItem {
  title: string;
  description?: string;
  link?: string;
  pubDate?: string;
}

function decodeRssText(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
}

function extractTag(block: string, tag: string): string | undefined {
  const cdata = block.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'));
  if (cdata?.[1]) return decodeRssText(cdata[1]);
  const plain = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return plain?.[1] ? decodeRssText(plain[1]) : undefined;
}

export function parseRssXml(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, 'title');
    if (!title) continue;
    items.push({
      title,
      description: extractTag(block, 'description'),
      link: extractTag(block, 'link'),
      pubDate: extractTag(block, 'pubDate'),
    });
  }
  return items;
}

async function fetchRssFeedOnce(url: string, ttlMs: number): Promise<RssItem[]> {
  const key = cacheKey('rss', url);
  const cached = cacheGet<RssItem[]>(key);
  if (cached?.length) return cached;

  try {
    const res = await fetch(externalFetchUrl(url), {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = parseRssXml(xml);
    if (items.length) cacheSet(key, items, ttlMs, ttlMs * 4);
    return items;
  } catch {
    return [];
  }
}

export async function fetchRssFeed(url: string, ttlMs = 120_000): Promise<RssItem[]> {
  return dedupeRequest(cacheKey('rss-fetch', url), () => fetchRssFeedOnce(url, ttlMs));
}

export function teamMatchTokens(name: string, abbr: string): string[] {
  const tokens = new Set<string>();
  if (abbr && abbr.length >= 2) tokens.add(abbr.toLowerCase());
  name.split(/\s+/).forEach((part) => {
    const clean = part.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (clean.length >= 3) tokens.add(clean);
  });
  const last = name.split(' ').pop()?.toLowerCase();
  if (last && last.length >= 3) tokens.add(last);
  return [...tokens];
}

export function textMentionsTeam(text: string, name: string, abbr: string): boolean {
  const lower = text.toLowerCase();
  const tokens = teamMatchTokens(name, abbr);
  return tokens.some((t) => lower.includes(t));
}

export function textMentionsPlayer(text: string, playerName: string): boolean {
  const lower = text.toLowerCase();
  const parts = playerName.toLowerCase().split(/\s+/).filter((p) => p.length >= 3);
  if (!parts.length) return false;
  const last = parts[parts.length - 1];
  if (!lower.includes(last)) return false;
  if (parts.length === 1) return true;
  return lower.includes(parts[0]) || lower.includes(playerName.toLowerCase());
}

export async function fetchRssJson<T>(url: string, label: string): Promise<T | null> {
  return fetchJsonResilient<T>(url, undefined, { label, retries: 1, timeout: 6_000 });
}
