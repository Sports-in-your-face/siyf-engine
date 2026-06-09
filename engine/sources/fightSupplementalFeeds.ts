import { parseFightEvents } from '../../services/parsers/parseFightEvents';
import type { Game } from '../../types';
import type { DataSource } from '../core/types';
import { espnMmaScoreboard } from './espnMmaSource';

export const SUPPLEMENTAL_FIGHT_ORGS = [
  { slug: 'boxe', label: 'Boxing', org: 'Boxing', priority: 620 },
  { slug: 'big-fight', label: 'Boxing', org: 'Boxing', priority: 600 },
  { slug: 'bellator', label: 'Bellator', org: 'Bellator', priority: 550 },
  { slug: 'pfl', label: 'PFL', org: 'PFL', priority: 500 },
] as const;

export type FightOrgSlug = (typeof SUPPLEMENTAL_FIGHT_ORGS)[number]['slug'] | 'ufc';

function tagOrgGames(
  games: Game[],
  slug: string,
  label: string,
  org: string,
  priority: number,
): Game[] {
  return games.map((g) => ({
    ...g,
    sport: org,
    leagueSlug: slug,
    context: g.context ?? {
      phase: 'regular' as const,
      badge: label.toUpperCase(),
      headline: g.tournamentName ?? label,
      priority,
    },
  }));
}

export async function fetchSupplementalFightScoreboards(): Promise<{ games: Game[]; sources: DataSource[] }> {
  const games: Game[] = [];
  const sources: DataSource[] = [];

  await Promise.all(
    SUPPLEMENTAL_FIGHT_ORGS.map(async ({ slug, label, org, priority }) => {
      try {
        const raw = await espnMmaScoreboard(slug);
        if (!raw?.events?.length) return;
        const parsed = parseFightEvents(raw.events, org);
        if (parsed.length) {
          games.push(...tagOrgGames(parsed, slug, label, org, priority));
          sources.push(`espn-mma-${slug}`);
        }
      } catch {
        // non-fatal
      }
    }),
  );

  return { games, sources };
}
