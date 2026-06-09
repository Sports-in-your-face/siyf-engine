import type { Game, Team } from '../../../types';

export function makeTeam(partial: Partial<Team> & Pick<Team, 'name' | 'abbr'>): Team {
  return {
    score: 0,
    ...partial,
  };
}

export function makeGame(partial: Partial<Game> & Pick<Game, 'id' | 'away' | 'home'>): Game {
  return {
    sport: 'BASKETBALL',
    status: 'Scheduled',
    statusState: 'pre',
    clock: '',
    ...partial,
  };
}
