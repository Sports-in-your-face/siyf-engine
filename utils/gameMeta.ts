import type { Game } from '../types';
import { isScoreboardNoiseText } from './scoreboardNoise';

export interface GameOddsDisplay {
  spread?: string;
  total?: string;
  book?: string;
}

function isOddsSpread(text?: string): boolean {
  if (!text) return false;
  if (/leads|wins|series|game \d/i.test(text)) return false;
  return /[+-]\d/.test(text);
}

/** RSS/API attribution labels — not meaningful event context for cards. */
const SOURCE_BADGE = /^(ESPN|CBS|FOX|NBC|ABC|TNT|TSN|YAHOO|ACTION|THE|USA|GUARDIAN|ATHLETIC|DRAFTKINGS|FANDUEL|BETMGM|CAESARS|HOOPSHYPE|REALGM|ROTOWORLD)$/i;

function isSourceAttributionBadge(badge?: string): boolean {
  if (!badge) return false;
  return SOURCE_BADGE.test(badge.trim());
}

export function getSeriesSummary(game: Game): string | undefined {
  const summary = game.context?.seriesSummary?.trim();
  if (!summary || isOddsSpread(summary) || isScoreboardNoiseText(summary)) return undefined;
  return summary;
}

export function extractGameOdds(game: Game): GameOddsDisplay | null {
  const ctx = game.context;
  if (!ctx) return null;

  const spread =
    ctx.oddsSpread
    ?? (isOddsSpread(ctx.seriesSummary) ? ctx.seriesSummary : undefined);
  const total =
    ctx.oddsTotal
    ?? (ctx.headline && /^o\/u/i.test(ctx.headline.trim()) ? ctx.headline.trim() : undefined);
  const book = ctx.oddsBook ?? (ctx.badge && !isSourceAttributionBadge(ctx.badge) ? ctx.badge : undefined);

  if (!spread && !total) return null;
  return { spread, total, book };
}

export function isSpecialGameCard(game: Game): boolean {
  return Boolean(game.special?.isSpecial && game.special.cardVariant === 'special');
}

export function specialGameLabel(game: Game): string | undefined {
  if (game.special?.isSpecial) return game.special.label;
  if (game.context?.badge && !isSourceAttributionBadge(game.context.badge)) {
    return game.context.badge;
  }
  if (
    (game.context?.phase === 'finals' || game.context?.phase === 'playoffs')
    && game.context.round
  ) {
    return game.context.round;
  }
  return undefined;
}

/** Primary context badge for cards and detail headers. */
export function contextBadge(game: Game): string | undefined {
  const label = specialGameLabel(game);
  if (label && isScoreboardNoiseText(label)) return undefined;
  return label;
}

export function isNationalTvGame(game: Game): boolean {
  return Boolean(game.context?.isNationalTv);
}

export function gameBroadcast(game: Game): string | undefined {
  return game.broadcast ?? game.context?.broadcast;
}

/** Venue · broadcast · attendance line for detail meta row. */
export function gameMetaLine(game: Game): string | undefined {
  const parts: string[] = [];
  if (game.venue) parts.push(game.venue);
  const broadcast = gameBroadcast(game);
  if (broadcast) parts.push(broadcast);
  if (game.attendance) {
    const n = parseInt(game.attendance.replace(/,/g, ''), 10);
    parts.push(Number.isNaN(n) ? game.attendance : `${n.toLocaleString()} attendance`);
  }
  return parts.length ? parts.join(' · ') : undefined;
}

export function specialGameLogo(game: Game): string | undefined {
  return game.special?.eventLogo;
}
