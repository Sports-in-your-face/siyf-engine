import { initAdjusterCdn } from './adjuster/adjusterCdnInit';
import { createSportEngine } from './createSportEngine';

initAdjusterCdn();
import { baseballConfig } from './configs/baseball';
import { basketballConfig } from './configs/basketball';
import { footballConfig } from './configs/football';
import { fightsConfig } from './configs/fights';
import { golfConfig } from './configs/golf';
import { hockeyConfig } from './configs/hockey';
import { soccerConfig } from './configs/soccer';
import { tennisConfig } from './configs/tennis';
import type { EngineSport } from './sportConfig';
import type { SportEngine } from './sportConfig';

export const baseballEngine = createSportEngine(baseballConfig);
export const basketballEngine = createSportEngine(basketballConfig);
export const footballEngine = createSportEngine(footballConfig);
export const fightsEngine = createSportEngine(fightsConfig);
export const golfEngine = createSportEngine(golfConfig);
export const hockeyEngine = createSportEngine(hockeyConfig);
export const soccerEngine = createSportEngine(soccerConfig);
export const tennisEngine = createSportEngine(tennisConfig);

const engines: Record<EngineSport, SportEngine> = {
  BASKETBALL: basketballEngine,
  FOOTBALL: footballEngine,
  SOCCER: soccerEngine,
  BASEBALL: baseballEngine,
  GOLF: golfEngine,
  TENNIS: tennisEngine,
  HOCKEY: hockeyEngine,
  FIGHTS: fightsEngine,
};

export function getEngine(sport: EngineSport): SportEngine {
  return engines[sport];
}

export type { GameDetail, ResolvedTeam, StandingsGroup } from './core/types';
export type { EngineSport, SportEngine } from './sportConfig';
export {
  getSportCapabilities,
  isTeamLayout,
  isIndividualLayout,
  SPORT_CAPABILITIES,
} from './core/sportCapabilities';
export type { SportCapabilities, SportFeatures, SportPipeline, SportApiProfile } from './core/sportCapabilities';
export { setEngineRuntimeMode, getEngineRuntimeMode } from './runtimeProfile';
