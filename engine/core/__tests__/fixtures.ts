import type { Game, GameContext, Team } from '../../../types';

export function makeOddsContext(partial: Partial<GameContext> = {}): GameContext {
  return {
    phase: 'regular',
    priority: 180,
    ...partial,
  };
}

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
