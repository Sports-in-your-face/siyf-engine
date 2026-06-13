import type { Player } from '../../types';

/**
 * G-League ESPN endpoints are unreliable (404 on /teams for many deployments).
 * Two-way tagging is disabled until a stable upstream path exists.
 */
export async function enrichRosterWithGLeague(_teamId: string, roster: Player[]): Promise<Player[]> {
  return roster;
}
