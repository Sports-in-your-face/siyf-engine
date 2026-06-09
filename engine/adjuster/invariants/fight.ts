import type { Game } from '../../../types';
import { coerceDisplayString } from '../../../utils/coerce';
import type { ParseInvariantIssue } from './types';
import { isLeakedObject, validateCompetitor, validateGameCore } from './common';

/** Fight card layouts: UFC, Boxing. */
export function validateFightLayout(game: Game): ParseInvariantIssue[] {
  const issues = validateGameCore(game);
  const id = game.id ?? 'unknown';
  if (!game.away || !game.home) return issues;

  const allowTbd = game.statusState === 'pre';
  issues.push(...validateCompetitor(game.away, 'away', id, { allowTbd }));
  issues.push(...validateCompetitor(game.home, 'home', id, { allowTbd }));

  if (!coerceDisplayString(game.tournamentName)) {
    issues.push({
      code: 'fight.card.missing',
      message: 'Fight card name missing',
      severity: 'warn',
      field: 'tournamentName',
      gameId: id,
    });
  }

  const org = (game.sport ?? '').toUpperCase();
  if (org === 'UFC' && !coerceDisplayString(game.weightClass)) {
    issues.push({
      code: 'fight.weight_class.missing',
      message: 'UFC bout missing weight class',
      severity: 'warn',
      field: 'weightClass',
      gameId: id,
    });
  }

  if (game.eventLog?.some((entry) => isLeakedObject(entry.value))) {
    issues.push({
      code: 'fight.event_log.object',
      message: 'Fight event log contains raw object values',
      severity: 'error',
      field: 'eventLog',
      gameId: id,
    });
  }

  if (game.away.name === game.home.name && game.away.name !== 'TBD') {
    issues.push({
      code: 'fight.duplicate_fighters',
      message: 'Away and home fighters share the same name',
      severity: 'warn',
      gameId: id,
    });
  }

  return issues;
}
