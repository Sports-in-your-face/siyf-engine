import type { Game } from '../../../types';
import { coerceDisplayString } from '../../../utils/coerce';
import type { ParseInvariantIssue } from './types';
import { validateCompetitor, validateGameCore, validateLeaderboardEntry } from './common';

/** Leaderboard layouts: PGA, LPGA golf. */
export function validateLeaderboardLayout(game: Game): ParseInvariantIssue[] {
  const issues = validateGameCore(game);
  const id = game.id ?? 'unknown';
  if (!game.away || !game.home) return issues;

  const allowTbd = game.statusState === 'pre';
  issues.push(...validateCompetitor(game.away, 'away', id, { allowTbd }));
  issues.push(...validateCompetitor(game.home, 'home', id, { allowTbd, allowFieldPlaceholder: true }));

  if (!game.leaderboard?.length) {
    if (game.statusState !== 'pre') {
      issues.push({
        code: 'leaderboard.missing',
        message: 'Golf game missing leaderboard entries',
        severity: 'error',
        field: 'leaderboard',
        gameId: id,
      });
    }
    return issues;
  }

  game.leaderboard.forEach((entry, index) => {
    issues.push(...validateLeaderboardEntry(entry, index, id));
  });

  const leaderName = coerceDisplayString(game.away.name);
  const boardLeader = coerceDisplayString(game.leaderboard[0]?.name);
  if (leaderName && boardLeader && leaderName !== boardLeader) {
    issues.push({
      code: 'leaderboard.leader.mismatch',
      message: 'Away team does not match leaderboard leader',
      severity: 'warn',
      field: 'away.name',
      gameId: id,
    });
  }

  if (!coerceDisplayString(game.tournamentName)) {
    issues.push({
      code: 'leaderboard.tournament.missing',
      message: 'Golf tournament name missing',
      severity: 'warn',
      field: 'tournamentName',
      gameId: id,
    });
  }

  return issues;
}
