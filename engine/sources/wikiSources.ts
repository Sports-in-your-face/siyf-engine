import { fetchJsonResilient } from '../core/resilientFetch';
import { cacheGet, cacheKey, cacheSet } from '../core/cache';
import type { Player, PlayerDetails } from '../../types';

function wikiTitle(name: string): string {
  return encodeURIComponent(name.replace(/\s+/g, '_'));
}

export async function fetchWikipediaBio(player: Player): Promise<Partial<PlayerDetails> | null> {
  const key = cacheKey('wiki', player.name);
  const cached = cacheGet<Partial<PlayerDetails>>(key);
  if (cached) return cached;

  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle(player.name)}`;
  const raw = await fetchJsonResilient<any>(url, undefined, {
    label: 'wikipedia-bio',
    retries: 1,
    timeout: 5_000,
  });
  if (!raw?.title) return null;

  const extract = raw.extract ?? '';
  const heightMatch = extract.match(/(\d+\s*(?:ft|feet)[\s\d]*(?:in|inches)?)/i);
  const weightMatch = extract.match(/(\d{2,3}\s*(?:lb|lbs|pounds))/i);
  const debutMatch = extract.match(/(?:debut|first played).*?(\d{4})/i);

  const patch: Partial<PlayerDetails> = {
    height: heightMatch?.[1],
    weight: weightMatch?.[1],
    debutYear: debutMatch ? parseInt(debutMatch[1], 10) : undefined,
  };

  cacheSet(key, patch, 86_400_000, 604_800_000);
  return patch;
}

export async function searchWikidataPlayers(query: string): Promise<Player[]> {
  const sparql = `
    SELECT ?player ?playerLabel ?teamLabel ?positionLabel WHERE {
      ?player wdt:P106 wd:Q3665646 .
      ?player rdfs:label ?playerLabel .
      FILTER(CONTAINS(LCASE(?playerLabel), "${query.toLowerCase().replace(/"/g, '')}"))
      OPTIONAL { ?player wdt:P54 ?team . ?team rdfs:label ?teamLabel . FILTER(LANG(?teamLabel) = "en") }
      OPTIONAL { ?player wdt:P413 ?position . ?position rdfs:label ?positionLabel . FILTER(LANG(?positionLabel) = "en") }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
    } LIMIT 12`;

  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
  const raw = await fetchJsonResilient<any>(url, undefined, {
    label: 'wikidata-search',
    retries: 1,
    timeout: 8_000,
  });

  const bindings = raw?.results?.bindings ?? [];
  const seen = new Set<string>();
  const players: Player[] = [];

  for (const b of bindings) {
    const uri = b.player?.value ?? '';
    const id = uri.split('/').pop() ?? '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    players.push({
      id,
      name: b.playerLabel?.value ?? query,
      team: b.teamLabel?.value ?? '—',
      position: b.positionLabel?.value ?? '—',
      stats: [],
    });
  }
  return players;
}

export async function wikidataSearchProvider(query: string): Promise<Player[]> {
  return searchWikidataPlayers(query);
}
