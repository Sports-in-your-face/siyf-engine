import { extractEspnEventsFromRaw, extractYahooScoreboardRoot } from './schemaPaths';

export type SourceProbeKind = 'espn-scoreboard' | 'yahoo-scoreboard';

export function probeEspnScoreboard(raw: unknown): boolean {
  return extractEspnEventsFromRaw(raw).length > 0;
}

export function probeYahooScoreboard(raw: unknown): boolean {
  const board = extractYahooScoreboardRoot(raw);
  if (!board) return false;
  const games = board.games;
  if (!games || typeof games !== 'object' || Array.isArray(games)) return false;
  return Object.keys(games as Record<string, unknown>).length > 0;
}

export function probeForKind(kind: SourceProbeKind, raw: unknown): boolean {
  switch (kind) {
    case 'espn-scoreboard':
      return probeEspnScoreboard(raw);
    case 'yahoo-scoreboard':
      return probeYahooScoreboard(raw);
    default:
      return raw != null;
  }
}
