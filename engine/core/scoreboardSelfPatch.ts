import {
  espnCustomScoreboardChain,
  espnScoreboardChainId,
  espnScoreboardEndpointChain,
  fetchWithSelfPatch,
  yahooScoreboardEndpointChain,
  YAHOO_SCOREBOARD_CHAIN_ID,
} from '../adjuster/sourcePatch';
import type { EngineSport } from '../sportConfig';
import type { SportType } from '../../services/api';

/** Self-healing ESPN scoreboard fetch for a sport tab. */
export async function fetchEspnScoreboardSelfPatch(
  sport: EngineSport | SportType,
  dates?: string,
): Promise<unknown | null> {
  const chainId = espnScoreboardChainId(sport);
  const result = await fetchWithSelfPatch({
    chainId,
    candidates: espnScoreboardEndpointChain(sport, dates),
    probe: 'espn-scoreboard',
    label: `espn-${String(sport).toLowerCase()}-scoreboard`,
  });
  return result.data;
}

/** Self-healing ESPN scoreboard for custom base paths (soccer league, etc.). */
export async function fetchEspnCustomScoreboardSelfPatch(
  chainId: string,
  basePath: string,
  dates?: string,
): Promise<unknown | null> {
  const result = await fetchWithSelfPatch({
    chainId,
    candidates: espnCustomScoreboardChain(chainId, basePath, dates),
    probe: 'espn-scoreboard',
    label: chainId,
  });
  return result.data;
}

/** Self-healing Yahoo trending scoreboard fetch. */
export async function fetchYahooScoreboardSelfPatch(): Promise<unknown | null> {
  const result = await fetchWithSelfPatch({
    chainId: YAHOO_SCOREBOARD_CHAIN_ID,
    candidates: yahooScoreboardEndpointChain(),
    probe: 'yahoo-scoreboard',
    label: 'yahoo-scoreboard',
  });
  return result.data;
}
