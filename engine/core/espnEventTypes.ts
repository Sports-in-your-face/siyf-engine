/** Minimal ESPN scoreboard/event shapes used across sport engines. */

export interface EspnLeagueRef {
  slug?: string;
}

export interface EspnCompetitionRef {
  league?: EspnLeagueRef;
}

export interface EspnSeasonRef {
  slug?: string;
}

export interface EspnScoreboardEvent {
  id?: string | number;
  leagues?: EspnLeagueRef[];
  league?: EspnLeagueRef;
  season?: EspnSeasonRef;
  competitions?: EspnCompetitionRef[];
}

export interface EspnScoreboardPayload {
  events?: EspnScoreboardEvent[];
  header?: { competitions?: EspnCompetitionRef[] };
  competitions?: EspnCompetitionRef[];
}

export function getEspnEvents(raw: unknown): EspnScoreboardEvent[] {
  if (!raw || typeof raw !== 'object') return [];
  const events = (raw as EspnScoreboardPayload).events;
  return Array.isArray(events) ? events : [];
}

export function findEspnEventById(
  events: EspnScoreboardEvent[],
  gameId: string,
): EspnScoreboardEvent | undefined {
  return events.find((event) => String(event.id) === gameId);
}

export function extractEspnLeagueSlug(
  event: EspnScoreboardEvent | undefined,
  competition?: EspnCompetitionRef,
  fallback = 'eng.1',
): string {
  return event?.leagues?.[0]?.slug
    ?? competition?.league?.slug
    ?? event?.league?.slug
    ?? event?.season?.slug
    ?? fallback;
}
