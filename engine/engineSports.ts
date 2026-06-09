import type { SportType } from '../services/api';

export const ENGINE_SPORTS = ['BASKETBALL', 'FOOTBALL', 'SOCCER', 'BASEBALL', 'GOLF', 'TENNIS', 'HOCKEY', 'FIGHTS'] as const satisfies readonly SportType[];

export type EngineSport = (typeof ENGINE_SPORTS)[number];

export function isEngineSport(sport: SportType): sport is EngineSport {
  return (ENGINE_SPORTS as readonly string[]).includes(sport);
}
