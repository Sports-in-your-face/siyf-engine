import { fetchCdnManifest } from '../../config/siyfCdn';
import { loadCdnAliasOverlay, resetCdnAliasOverlay } from './cdnAliases';
import { resetHotPathRegistry } from './hotPathRegistry';
import { loadCdnPauseKeywordsOverlay } from './statusClassifier';
import { loadAdjusterSchemaFromCdn } from '../acl/schemaVersion';

const POLL_MS = 30_000;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastFieldVersion: number | undefined;
let lastPauseVersion: number | undefined;
let lastSchemaVersion: number | undefined;
let started = false;

/** Refresh CDN hotfix overlays when manifest versions change. */
export async function refreshAdjusterCdn(): Promise<void> {
  const manifest = await fetchCdnManifest();
  const fieldVersion = manifest?.fieldAliasesVersion;
  const pauseVersion = manifest?.pauseKeywordsVersion;
  const schemaVersion = manifest?.adjusterSchemaVersion;

  if (fieldVersion !== lastFieldVersion) {
    lastFieldVersion = fieldVersion;
    resetCdnAliasOverlay();
    resetHotPathRegistry();
    await loadCdnAliasOverlay();
  }

  if (pauseVersion !== lastPauseVersion) {
    lastPauseVersion = pauseVersion;
    await loadCdnPauseKeywordsOverlay();
  }

  if (schemaVersion !== lastSchemaVersion) {
    lastSchemaVersion = schemaVersion;
    resetHotPathRegistry();
    await loadAdjusterSchemaFromCdn();
  }
}

/** Load CDN alias + pause-keyword overlays and poll manifest every 30s. */
export function initAdjusterCdn(): void {
  if (started) return;
  started = true;
  void refreshAdjusterCdn();
  if (typeof setInterval !== 'undefined') {
    pollTimer = setInterval(() => void refreshAdjusterCdn(), POLL_MS);
  }
}

export function stopAdjusterCdnPoll(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  started = false;
  lastFieldVersion = undefined;
  lastPauseVersion = undefined;
  lastSchemaVersion = undefined;
}
