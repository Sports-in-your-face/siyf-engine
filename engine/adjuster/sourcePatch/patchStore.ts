const STORAGE_KEY = 'siyf_source_patch_v1';

type PatchMemory = Record<string, number>;

let sessionMemory: PatchMemory = {};

function readStorage(): PatchMemory {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as PatchMemory : {};
  } catch {
    return {};
  }
}

function writeStorage(memory: PatchMemory): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    /* quota / private mode */
  }
}

/** Preferred endpoint index for a chain (session + localStorage). */
export function getPreferredEndpointIndex(chainId: string): number {
  if (chainId in sessionMemory) return sessionMemory[chainId];
  const stored = readStorage()[chainId];
  return typeof stored === 'number' && stored >= 0 ? stored : 0;
}

export function rememberPreferredEndpoint(chainId: string, index: number): void {
  sessionMemory[chainId] = index;
  const next = { ...readStorage(), [chainId]: index };
  writeStorage(next);
}

export function resetPatchStore(): void {
  sessionMemory = {};
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function getPatchStoreSnapshot(): PatchMemory {
  return { ...readStorage(), ...sessionMemory };
}
