import type { SportCapabilities, SportFeatures, SportPipeline } from './core/sportCapabilities';

export type EngineRuntimeMode = 'default' | 'extension';

let mode: EngineRuntimeMode = 'default';

/** Chrome extension: skip website-only enrichment (RSS headlines, playoff cross-check, team notes). */
export function setEngineRuntimeMode(next: EngineRuntimeMode): void {
  mode = next;
}

export function getEngineRuntimeMode(): EngineRuntimeMode {
  return mode;
}

const EXTENSION_PIPELINE: Partial<SportPipeline> = {
  rss: false,
  odds: false,
  fanDuelPerformers: false,
  enrichMissingContext: false,
  teamNotes: false,
};

const EXTENSION_FEATURES: Partial<SportFeatures> = {
  standings: false,
};

export function applyRuntimeCapabilities(capabilities: SportCapabilities): SportCapabilities {
  if (mode !== 'extension') return capabilities;
  return {
    ...capabilities,
    features: { ...capabilities.features, ...EXTENSION_FEATURES },
    pipeline: { ...capabilities.pipeline, ...EXTENSION_PIPELINE },
  };
}
