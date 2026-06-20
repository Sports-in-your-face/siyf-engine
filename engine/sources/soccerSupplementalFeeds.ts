import { parseEventsForSport } from '../../services/parsers/parseGameEvent';
import type { Game } from '../../types';
import { CORE_SOCCER_LEAGUES, isCoreSoccerLeague } from '../core/coreSoccerLeagues';
import { createEngineLog, safeTryAsync } from '../core/engineUtils';
import { findEspnEventById, getEspnEvents } from '../core/espnEventTypes';
import type { DataSource } from '../core/types';
import { espnSoccerScoreboard, extractLeagueSlug } from './espnSoccerSource';
import { leagueLabel } from './teamRegistry';

/** European cups and secondary leagues — not the six core domestic hubs. */
export const SUPPLEMENTAL_SOCCER_LEAGUES = [
  { slug: 'uefa.champions', label: 'Champions League', priority: 900 },
  { slug: 'uefa.europa', label: 'Europa League', priority: 500 },
  { slug: 'uefa.europa.conf', label: 'Conference League', priority: 450 },
  { slug: 'eng.fa', label: 'FA Cup', priority: 480 },
  { slug: 'eng.league_cup', label: 'League Cup', priority: 420 },
  { slug: 'ned.1', label: 'Eredivisie', priority: 380 },
  { slug: 'por.1', label: 'Primeira Liga', priority: 380 },
  { slug: 'eng.2', label: 'Championship', priority: 360 },
  { slug: 'mex.1', label: 'Liga MX', priority: 340 },
  { slug: 'bra.1', label: 'Brasileirão', priority: 340 },
] as const;

const log = createEngineLog('soccer-supplemental');

function tagLeagueGames(games: Game[], slug: string, label: string, priority: number): Game[] {
  return games.map((g) => ({
    ...g,
    leagueSlug: slug,
    sport: 'SOCCER',
    subtitle: g.subtitle ?? label,
    context: g.context ?? {
      phase: slug.includes('uefa') ? 'playoffs' as const : 'regular' as const,
      badge: label.toUpperCase(),
      headline: label,
      priority,
    },
  }));
}

async function fetchLeagueScoreboardGames(
  slug: string,
  label: string,
  priority: number,
): Promise<{ games: Game[]; source?: DataSource }> {
  const raw = await safeTryAsync(log, 'fetchLeagueScoreboard', slug, () => espnSoccerScoreboard(slug), null);
  const events = getEspnEvents(raw);
  if (!events.length) return { games: [] };

  const parsed = parseEventsForSport(events, 'SOCCER').map((g) => {
    const event = findEspnEventById(events, g.id);
    return {
      ...g,
      leagueSlug: extractLeagueSlug(event, event?.competitions?.[0]) || slug,
    };
  });

  return {
    games: tagLeagueGames(parsed, slug, label, priority),
    source: `espn-${slug}`,
  };
}

export async function fetchSupplementalSoccerScoreboards(): Promise<{ games: Game[]; sources: DataSource[] }> {
  const games: Game[] = [];
  const sources: DataSource[] = [];

  await Promise.all(
    SUPPLEMENTAL_SOCCER_LEAGUES.map(async ({ slug, label, priority }) => {
      if (isCoreSoccerLeague(slug)) return;
      const result = await fetchLeagueScoreboardGames(slug, label, priority);
      if (result.games.length) {
        games.push(...result.games);
        if (result.source) sources.push(result.source);
      }
    }),
  );

  return { games, sources };
}

export async function fetchSoccerLeagueScoreboard(slug: string): Promise<Game[]> {
  const label = leagueLabel(slug);
  const priority = SUPPLEMENTAL_SOCCER_LEAGUES.find((l) => l.slug === slug)?.priority
    ?? CORE_SOCCER_LEAGUES.find((l) => l.slug === slug)?.priority
    ?? 300;
  const result = await fetchLeagueScoreboardGames(slug, label, priority);
  return result.games;
}

export { leagueLabel };
