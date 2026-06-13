import {
  AGE_OUT_MS,
  GOVERNOR_HOUR_BUDGET,
} from '../core/apiGovernor';
import { fetchCdnAdjusterSchema, type CdnAdjusterSchemaFile } from '../../config/siyfCdn';

export type AdjusterSchemaFile = CdnAdjusterSchemaFile;

export interface AdjusterSchemaStatus {
  bundledVersion: number;
  cdnVersion: number | null;
  matched: boolean;
  mismatchLogged: boolean;
  loadedAt: number | null;
  governorAligned: boolean;
}

/** Bundled registry / engine schema generation — bump when registry aliases change. */
export const BUNDLED_ADJUSTER_SCHEMA_VERSION = 1;

let status: AdjusterSchemaStatus = {
  bundledVersion: BUNDLED_ADJUSTER_SCHEMA_VERSION,
  cdnVersion: null,
  matched: true,
  mismatchLogged: false,
  loadedAt: null,
  governorAligned: true,
};

function governorMatches(schema: AdjusterSchemaFile): boolean {
  const gov = schema.governor;
  if (!gov) return true;
  return gov.hourBudget === GOVERNOR_HOUR_BUDGET && gov.ageOutMs === AGE_OUT_MS;
}

export function getAdjusterSchemaStatus(): AdjusterSchemaStatus {
  return { ...status };
}

export function resetAdjusterSchemaStatus(): void {
  status = {
    bundledVersion: BUNDLED_ADJUSTER_SCHEMA_VERSION,
    cdnVersion: null,
    matched: true,
    mismatchLogged: false,
    loadedAt: null,
    governorAligned: true,
  };
}

/** Load CDN schema pin; log mismatch and keep bundled registry on drift. */
export async function loadAdjusterSchemaFromCdn(): Promise<AdjusterSchemaStatus> {
  const schema = await fetchCdnAdjusterSchema();
  const cdnVersion = schema?.version ?? null;
  const matched = cdnVersion == null || cdnVersion === BUNDLED_ADJUSTER_SCHEMA_VERSION;
  const governorAligned = schema ? governorMatches(schema) : true;

  if (!matched && !status.mismatchLogged) {
    console.warn(
      `[adjuster-schema] CDN version ${cdnVersion} != bundled ${BUNDLED_ADJUSTER_SCHEMA_VERSION}; using bundled registry`,
    );
  }
  if (schema && !governorAligned && !status.mismatchLogged) {
    console.warn('[adjuster-schema] CDN governor constants differ from engine; using bundled values');
  }

  status = {
    bundledVersion: BUNDLED_ADJUSTER_SCHEMA_VERSION,
    cdnVersion,
    matched,
    mismatchLogged: status.mismatchLogged || !matched || !governorAligned,
    loadedAt: Date.now(),
    governorAligned,
  };
  return getAdjusterSchemaStatus();
}

export async function checkAdjusterSchemaVersion(): Promise<boolean> {
  const next = await loadAdjusterSchemaFromCdn();
  return next.matched && next.governorAligned;
}
