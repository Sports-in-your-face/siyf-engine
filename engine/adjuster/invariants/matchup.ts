import type { Game } from '../../../types';
import { coerceDisplayString } from '../../../utils/coerce';
import type { ParseInvariantIssue } from './types';
import { validateCompetitor, validateGameCore } from './common';

/** Athlete-vs-athlete layouts: ATP, WTA tennis. */
export function validateMatchupLayout(game: Game): ParseInvariantIssue[] {
  const issues = validateGameCore(game);
  const id = game.id ?? 'unknown';
  if (!game.away || !game.home) return issues;

  // TBD placeholders are normal for unannounced bracket slots during live events.
  issues.push(...validateCompetitor(game.away, 'away', id, { allowTbd: true }));
  issues.push(...validateCompetitor(game.home, 'home', id, { allowTbd: true }));

  if (!coerceDisplayString(game.tournamentName)) {
    issues.push({
      code: 'matchup.tournament.missing',
      message: 'Tennis tournament name missing',
      severity: 'warn',
      field: 'tournamentName',
      gameId: id,
    });
  }

  if (game.away.name === game.home.name && game.away.name !== 'TBD') {
    issues.push({
      code: 'matchup.duplicate_names',
      message: 'Away and home athletes share the same name',
      severity: 'warn',
      gameId: id,
    });
  }

  return issues;
}
