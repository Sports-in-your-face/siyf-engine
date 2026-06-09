import { parseEventsForSport } from '../../services/parsers/parseGameEvent';
import type { Game } from '../../types';
import { createEngineLog, safeTryAsync } from '../core/engineUtils';
import { findEspnEventById, getEspnEvents } from '../core/espnEventTypes';
import type { DataSource } from '../core/types';
import { espnSoccerScoreboard, extractLeagueSlug } from './espnSoccerSource';
import { leagueLabel } from './teamRegistry';

export const SUPPLEMENTAL_SOCCER_LEAGUES = [
  { slug: 'uefa.champions', label: 'Champions League', priority: 900 },
  { slug: 'uefa.europa', label: 'Europa League', priority: 500 },
  { slug: 'uefa.europa.conf', label: 'Conference League', priority: 450 },
  { slug: 'eng.fa', label: 'FA Cup', priority: 480 },
  { slug: 'eng.league_cup', label: 'League Cup', priority: 420 },
  { slug: 'esp.1', label: 'La Liga', priority: 400 },
  { slug: 'ger.1', label: 'Bundesliga', priority: 400 },
  { slug: 'fra.1', label: 'Ligue 1', priority: 400 },
  { slug: 'ita.1', label: 'Serie A', priority: 400 },
  { slug: 'ned.1', label: 'Eredivisie', priority: 380 },
  { slug: 'por.1', label: 'Primeira Liga', priority: 380 },
  { slug: 'eng.2', label: 'Championship', priority: 360 },
  { slug: 'usa.1', label: 'MLS', priority: 350 },
  { slug: 'mex.1', label: 'Liga MX', priority: 340 },
  { slug: 'bra.1', label: 'Brasileirão', priority: 340 },
] as const;

const log = createEngineLog('soccer-supplemental');

function tagLeagueGames(games: Game[], slug: string, label: string): Game[] {
  return games.map((g) => ({
    ...g,
    leagueSlug: slug,
    sport: 'SOCCER',
    subtitle: g.subtitle ?? label,
    context: g.context ?? {
      phase: slug.includes('uefa') ? 'playoffs' as const : 'regular' as const,
      badge: label.toUpperCase(),
      headline: label,
      priority: SUPPLEMENTAL_SOCCER_LEAGUES.find((l) => l.slug === slug)?.priority ?? 300,
    },
  }));
}

export async function fetchSupplementalSoccerScoreboards(): Promise<{ games: Game[]; sources: DataSource[] }> {
  const games: Game[] = [];
  const sources: DataSource[] = [];

  await Promise.all(
    SUPPLEMENTAL_SOCCER_LEAGUES.map(async ({ slug, label }) => {
      const raw = await safeTryAsync(log, 'fetchSupplemental', slug, () => espnSoccerScoreboard(slug), null);
      const events = getEspnEvents(raw);
      if (!events.length) return;

      const parsed = parseEventsForSport(events, 'SOCCER').map((g) => {
        const event = findEspnEventById(events, g.id);
        return {
          ...g,
          leagueSlug: extractLeagueSlug(event, event?.competitions?.[0]) || slug,
        };
      });
      if (parsed.length) {
        games.push(...tagLeagueGames(parsed, slug, label));
        sources.push(`espn-${slug}`);
      }
    }),
  );

  return { games, sources };
}

export async function fetchSoccerLeagueScoreboard(slug: string): Promise<Game[]> {
  const raw = await espnSoccerScoreboard(slug);
  const events = getEspnEvents(raw);
  if (!events.length) return [];
  return parseEventsForSport(events, 'SOCCER').map((g) => {
    const event = findEspnEventById(events, g.id);
    return {
      ...g,
      leagueSlug: extractLeagueSlug(event, event?.competitions?.[0]) || slug,
    };
  });
}

export { leagueLabel };
