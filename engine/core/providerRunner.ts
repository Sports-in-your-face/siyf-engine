import { createEngineLog } from './engineUtils';

const log = createEngineLog('providers');

export interface ProviderAttempt<T> {
  id: string;
  fetch: () => Promise<T | null | undefined>;
}

export async function cascadeFirst<T>(
  attempts: ProviderAttempt<T>[],
  fallback: T,
  isEmpty: (value: T) => boolean = (v) =>
    Array.isArray(v) ? v.length === 0 : v == null,
): Promise<{ data: T; sources: string[] }> {
  for (const attempt of attempts) {
    try {
      const result = await attempt.fetch();
      if (result != null && !isEmpty(result)) {
        return { data: result, sources: [attempt.id] };
      }
    } catch (err) {
      log('warn', 'cascadeFirst', `provider ${attempt.id} failed`, err);
    }
  }
  return { data: fallback, sources: ['fallback'] };
}

export async function cascadeMergePartial<T>(
  attempts: ProviderAttempt<Partial<T>>[],
  base: T,
  merge: (current: T, patch: Partial<T>, source: string) => T,
): Promise<{ data: T; sources: string[] }> {
  let data = base;
  const sources: string[] = [];
  for (const attempt of attempts) {
    try {
      const patch = await attempt.fetch();
      if (!patch || (typeof patch === 'object' && !Object.keys(patch).length)) continue;
      data = merge(data, patch, attempt.id);
      sources.push(attempt.id);
    } catch (err) {
      log('warn', 'cascadeMergePartial', `provider ${attempt.id} failed`, err);
    }
  }
  return { data, sources: sources.length ? sources : ['fallback'] };
}

export async function parallelAllSettled<T>(
  tasks: ProviderAttempt<T>[],
): Promise<{ id: string; data: T | null }[]> {
  const results = await Promise.allSettled(tasks.map((t) => t.fetch()));
  return results.map((r, i) => ({
    id: tasks[i].id,
    data: r.status === 'fulfilled' ? (r.value ?? null) : null,
  }));
}
