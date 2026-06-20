import { deepGet, resolveFirst, type FieldPath } from '../fieldResolver';

/** Where ESPN hides the events array when scoreboard JSON shape drifts. */
export const ESPN_EVENTS_PATH_ALIASES: readonly FieldPath[] = [
  ['events'],
  ['scoreboard', 'events'],
  ['data', 'events'],
  ['sports', 0, 'leagues', 0, 'events'],
  ['leagues', 0, 'events'],
  ['content', 'events'],
  ['content', 'sbData', 'events'],
];

/** Yahoo scoreboard root when editorial API wraps data differently. */
export const YAHOO_SCOREBOARD_ROOT_ALIASES: readonly FieldPath[] = [
  ['service', 'scoreboard'],
  ['scoreboard'],
  ['data', 'scoreboard'],
  ['service', 'data', 'scoreboard'],
];

export function extractEspnEventsFromRaw(raw: unknown): unknown[] {
  const discovered = discoverEspnEventsArray(raw);
  if (discovered) return discovered;

  const events = resolveFirst(raw, ESPN_EVENTS_PATH_ALIASES);
  return Array.isArray(events) ? events : [];
}

export function extractYahooScoreboardRoot(raw: unknown): Record<string, unknown> | null {
  for (const path of YAHOO_SCOREBOARD_ROOT_ALIASES) {
    const node = deepGet(raw, path);
    if (isYahooScoreboardNode(node)) return node;
  }

  const discovered = discoverYahooScoreboardRoot(raw);
  return discovered;
}

function isEspnEventLike(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  if (Array.isArray(row.competitions) && row.competitions.length > 0) return true;
  if (row.id != null && (row.status != null || row.competitions != null)) return true;
  return false;
}

function isYahooGameLike(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.gameid === 'string'
    || (typeof row.home_team_id === 'string' && typeof row.away_team_id === 'string');
}

function isYahooScoreboardNode(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== 'object') return false;
  const games = (node as Record<string, unknown>).games;
  if (!games || typeof games !== 'object' || Array.isArray(games)) return false;
  const first = Object.values(games as Record<string, unknown>)[0];
  return isYahooGameLike(first);
}

/** BFS for an array of ESPN-shaped event objects (runtime schema discovery). */
export function discoverEspnEventsArray(raw: unknown, maxDepth = 7): unknown[] | null {
  if (!raw || typeof raw !== 'object') return null;

  const queue: Array<{ node: unknown; depth: number }> = [{ node: raw, depth: 0 }];
  const seen = new Set<unknown>();

  while (queue.length) {
    const { node, depth } = queue.shift()!;
    if (node == null || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);

    if (Array.isArray(node)) {
      if (node.length > 0 && node.every(isEspnEventLike)) return node;
      continue;
    }

    if (depth >= maxDepth) continue;

    for (const value of Object.values(node as Record<string, unknown>)) {
      if (value != null && typeof value === 'object') {
        queue.push({ node: value, depth: depth + 1 });
      }
    }
  }

  return null;
}

/** BFS for Yahoo scoreboard node with games map. */
export function discoverYahooScoreboardRoot(raw: unknown, maxDepth = 6): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;

  const queue: Array<{ node: unknown; depth: number }> = [{ node: raw, depth: 0 }];
  const seen = new Set<unknown>();

  while (queue.length) {
    const { node, depth } = queue.shift()!;
    if (node == null || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);

    if (isYahooScoreboardNode(node)) return node as Record<string, unknown>;

    if (depth >= maxDepth) continue;

    for (const value of Object.values(node as Record<string, unknown>)) {
      if (value != null && typeof value === 'object') {
        queue.push({ node: value, depth: depth + 1 });
      }
    }
  }

  return null;
}
