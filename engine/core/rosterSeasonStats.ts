import type { StatItem } from '../core/types';
import type { Player } from '../../types';

const DEFAULT_BATCH = 6;

export async function batchFetchPlayerStats(
  playerIds: string[],
  fetchOne: (id: string) => Promise<StatItem[] | null>,
  batchSize = DEFAULT_BATCH,
): Promise<Map<string, StatItem[]>> {
  const result = new Map<string, StatItem[]>();
  const unique = [...new Set(playerIds.filter(Boolean))];
  if (!unique.length) return result;

  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (id) => {
        try {
          const stats = await fetchOne(id);
          if (stats?.length) result.set(id, stats);
        } catch {
          /* best-effort */
        }
      }),
    );
  }

  return result;
}

export function mergeRosterStats(roster: Player[], statsById: Map<string, StatItem[]>): Player[] {
  if (!statsById.size) return roster;
  return roster.map((player) => {
    const fetched = statsById.get(player.id);
    if (!fetched?.length) return player;
    if (player.stats.length) return player;
    return { ...player, stats: fetched };
  });
}
