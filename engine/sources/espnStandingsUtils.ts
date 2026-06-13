import { fetchJsonResilient } from '../core/resilientFetch';

function hasStandingsChildren(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const data = raw as Record<string, unknown>;
  const children = (data.children ?? (data.standings as Record<string, unknown>)?.children) as unknown[] | undefined;
  return Array.isArray(children) && children.length > 0;
}

/** Site v2 `/standings` often 200s with no `children`; v2 alt has the table. */
export async function fetchEspnStandingsPayload(
  siteUrl: string,
  altUrl: string,
  label: string,
): Promise<Record<string, unknown> | null> {
  let data = await fetchJsonResilient<Record<string, unknown>>(siteUrl, undefined, { label });
  if (!hasStandingsChildren(data)) {
    data = await fetchJsonResilient<Record<string, unknown>>(altUrl, undefined, { label: `${label}-alt` });
  }
  return data && hasStandingsChildren(data) ? data : null;
}

export function extractStandingsChildren(data: Record<string, unknown>): unknown[] {
  const standings = data.standings as Record<string, unknown> | undefined;
  return (data.children ?? standings?.children ?? []) as unknown[];
}
