import { gameMatchKey } from '../core/mergeGames';
import {
  extractEspnLeagueSlug,
  getEspnEvents,
  type EspnScoreboardEvent,
} from '../core/espnEventTypes';
import { getSoccerScoreboardLeagues } from '../soccerLeagueFilter';
import type { Game } from '../../types';
import { DEFAULT_SOCCER_LEAGUE, espnSoccerScoreboard } from './espnSoccerSource';
import { getActiveSoccerLeagueSlugs, getCoreSoccerLeagueSlugs } from './soccerLeagues';

const INTERNATIONAL_HINT_SLUGS = ['fifa.world', 'fifa.friendly.world'] as const;

import { isYahooSourcedGameId, isEspnNumericEventId } from '../core/espnSummaryGuard';

export { isYahooSourcedGameId as isYahooSourcedGame, isEspnNumericEventId };

function isValidSoccerLeagueSlug(slug: string | undefined): slug is string {
  if (!slug) return false;
  if (slug.includes('group')) return false;
  return /^[a-z0-9.]+$/i.test(slug);
}

function normalizeSoccerLeagueSlug(game: Game): string {
  if (internationalHintSlugs(game).length) return INTERNATIONAL_HINT_SLUGS[0];
  if (isValidSoccerLeagueSlug(game.leagueSlug)) return game.leagueSlug;
  return DEFAULT_SOCCER_LEAGUE;
}

function competitionMatchKey(event: EspnScoreboardEvent): string | null {
  const comp = event.competitions?.[0] as { competitors?: Array<{ homeAway?: string; team?: { abbreviation?: string } }> } | undefined;
  const away = comp?.competitors?.find((c) => c.homeAway === 'away');
  const home = comp?.competitors?.find((c) => c.homeAway === 'home');
  const awayAbbr = away?.team?.abbreviation;
  const homeAbbr = home?.team?.abbreviation;
  if (!awayAbbr || !homeAbbr) return null;
  return gameMatchKey(awayAbbr, homeAbbr, 'SOCCER');
}

function gameMatchKeyForGame(game: Game): string {
  return gameMatchKey(game.away.abbr, game.home.abbr, 'SOCCER');
}

function internationalHintSlugs(game: Game): string[] {
  const hint = `${game.subtitle ?? ''} ${game.context?.headline ?? ''} ${game.context?.badge ?? ''}`.toLowerCase();
  if (/world cup|fifa|international/i.test(hint)) return [...INTERNATIONAL_HINT_SLUGS];
  return [];
}

function orderedLeagueSlugs(game: Game): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (slug: string | undefined) => {
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    out.push(slug);
  };

  if (isValidSoccerLeagueSlug(game.leagueSlug)) push(game.leagueSlug);
  for (const slug of internationalHintSlugs(game)) push(slug);
  for (const slug of getSoccerScoreboardLeagues()) push(slug);
  for (const slug of getCoreSoccerLeagueSlugs()) push(slug);
  for (const slug of getActiveSoccerLeagueSlugs()) push(slug);

  return out;
}

/** Resolve a Yahoo-only row to an ESPN event via team matchup across league scoreboards. */
export async function resolveEspnSoccerEventByMatchup(
  game: Game,
): Promise<{ eventId: string; league: string } | null> {
  const targetKey = gameMatchKeyForGame(game);

  for (const slug of orderedLeagueSlugs(game)) {
    const raw = await espnSoccerScoreboard(slug);
    const events = getEspnEvents(raw);
    for (const event of events) {
      if (!event.id || competitionMatchKey(event) !== targetKey) continue;
      const league = extractEspnLeagueSlug(event, event.competitions?.[0], slug);
      return { eventId: String(event.id), league };
    }
  }

  return null;
}

export async function resolveSoccerSummaryTarget(
  game: Game,
): Promise<{ eventId: string; league: string } | null> {
  if (isYahooSourcedGameId(game.id)) {
    return resolveEspnSoccerEventByMatchup(game);
  }
  if (!isEspnNumericEventId(game.id)) return null;
  return {
    eventId: game.id,
    league: normalizeSoccerLeagueSlug(game),
  };
}

export function buildSoccerSummaryFallbackLeagues(primaryLeague: string, game: Game): string[] {
  const intl = internationalHintSlugs(game);
  const active = getSoccerScoreboardLeagues().filter((slug) => slug !== primaryLeague);
  const rest = orderedLeagueSlugs(game).filter(
    (slug) => slug !== primaryLeague && !active.includes(slug) && !intl.includes(slug),
  );
  // Cap league fan-out — avoid hammering every supplemental slug on a bad id.
  return [...intl, ...active, ...rest].slice(0, 5);
}
