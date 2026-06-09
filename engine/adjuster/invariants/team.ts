import type { Game } from '../../../types';
import type { ParseInvariantIssue } from './types';
import { validateCompetitor, validateGameCore } from './common';

/** Team-vs-team layouts: NBA, NFL, soccer, baseball, hockey, WNBA, NCAA. */
export function validateTeamLayout(game: Game): ParseInvariantIssue[] {
  const issues = validateGameCore(game);
  const id = game.id ?? 'unknown';
  if (!game.away || !game.home) return issues;

  const allowTbd = game.statusState === 'pre';
  issues.push(...validateCompetitor(game.away, 'away', id, { allowTbd }));
  issues.push(...validateCompetitor(game.home, 'home', id, { allowTbd }));

  return issues;
}
