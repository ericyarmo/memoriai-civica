// Milan tree inventory via CKAN DataStore API.
// 251K+ georeferenced trees with species, dimensions, location.

const CKAN_BASE = 'https://dati.comune.milano.it/api/3/action/datastore_search';
const RESOURCE_ID = '604dd6bb-7ec8-4262-babb-1fa392f864cc';

export interface Tree {
  municipio: number;
  localita: string;
  genere: string;   // genus
  specie: string;   // species
  varieta: string;  // variety
  diam_tronc: number; // trunk diameter cm
  diam_chiom: number; // crown diameter m
  h_m: number;        // height m
  LONG_X_4326: number;
  LAT_Y_4326: number;
}

export interface TreeResult {
  trees: Tree[];
  totalRecords: number;
  speciesCounts: Record<string, number>;
  avgHeight: number;
  avgCrownDiameter: number;
}

export async function getTrees(
  municipio?: number,
  genus?: string,
  limit: number = 200,
): Promise<TreeResult> {
  const filters: Record<string, unknown> = {};
  if (municipio) filters.municipio = municipio;
  if (genus) filters.genere = genus;

  const params = new URLSearchParams({
    resource_id: RESOURCE_ID,
    limit: String(limit),
  });
  if (Object.keys(filters).length > 0) {
    params.set('filters', JSON.stringify(filters));
  }

  const resp = await fetch(`${CKAN_BASE}?${params}`);
  if (!resp.ok) throw new Error(`Trees API ${resp.status}: ${await resp.text()}`);
  const data = await resp.json() as { result: { records: Tree[]; total: number } };
  const { records, total } = data.result;

  // Species counts
  const speciesCounts: Record<string, number> = {};
  for (const t of records) {
    const name = `${t.genere} ${t.specie}`.trim() || 'Unknown';
    speciesCounts[name] = (speciesCounts[name] || 0) + 1;
  }

  // Averages
  const heights = records.map(t => t.h_m).filter(h => h > 0);
  const crowns = records.map(t => t.diam_chiom).filter(d => d > 0);

  return {
    trees: records,
    totalRecords: total,
    speciesCounts,
    avgHeight: heights.length > 0
      ? +(heights.reduce((a, b) => a + b, 0) / heights.length).toFixed(1)
      : 0,
    avgCrownDiameter: crowns.length > 0
      ? +(crowns.reduce((a, b) => a + b, 0) / crowns.length).toFixed(1)
      : 0,
  };
}

// Get total tree count for a municipio (uses SQL endpoint for efficiency)
export async function getTreeCount(municipio: number): Promise<number> {
  const url = 'https://dati.comune.milano.it/api/3/action/datastore_search_sql';
  const sql = `SELECT COUNT(*) as count FROM "${RESOURCE_ID}" WHERE municipio = ${municipio}`;
  const resp = await fetch(`${url}?sql=${encodeURIComponent(sql)}`);
  if (!resp.ok) return 0;
  const data = await resp.json() as { result: { records: Array<{ count: number }> } };
  return data.result?.records?.[0]?.count ?? 0;
}
