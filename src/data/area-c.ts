// Milan Area C congestion charge data via CKAN DataStore API.
// Daily vehicle entries into Milan's congestion zone.

const CKAN_BASE = 'https://dati.comune.milano.it/api/3/action/datastore_search';

// 2019-present consolidated daily totals
const RESOURCE_CURRENT = 'b25e13d8-7fcb-46e3-b1e9-ff81b18f5c84';
// Historical pre-2019
const RESOURCE_HISTORICAL = 'c2f46ef8-9ee8-4883-807d-93adeb1b9931';

export interface AreaCEntry {
  data_giorno: string;
  giorno?: string;
  totale_transiti_giornalieri_h24?: number;
  'totale_transiti_giornalieri_7.30_19.30_autoveicoli'?: number;
  'totale_transiti_giornalieri_7.30_19.30_ciclomotori_motocicli'?: number;
  numero_transiti_giornalieri?: number; // historical format
  [key: string]: unknown;
}

export interface AreaCResult {
  entries: AreaCEntry[];
  totalRecords: number;
  avgDailyTransits: number;
  period: string;
}

async function queryCKAN(resourceId: string, limit: number = 200, filters?: Record<string, string>): Promise<{ records: AreaCEntry[]; total: number }> {
  const params = new URLSearchParams({
    resource_id: resourceId,
    limit: String(limit),
    sort: 'data_giorno desc',
  });
  if (filters) params.set('filters', JSON.stringify(filters));

  const resp = await fetch(`${CKAN_BASE}?${params}`);
  if (!resp.ok) throw new Error(`Area C API ${resp.status}: ${await resp.text()}`);
  const data = await resp.json() as { result: { records: AreaCEntry[]; total: number } };
  return data.result;
}

// Get recent Area C data
export async function getAreaC(limit: number = 100): Promise<AreaCResult> {
  const { records, total } = await queryCKAN(RESOURCE_CURRENT, limit);

  // Compute average daily transits
  const dailyTotals = records
    .map(r => r.totale_transiti_giornalieri_h24 ?? r.numero_transiti_giornalieri ?? 0)
    .filter(v => v > 0);

  const avg = dailyTotals.length > 0
    ? Math.round(dailyTotals.reduce((a, b) => a + b, 0) / dailyTotals.length)
    : 0;

  const dates = records.map(r => r.data_giorno).filter(Boolean).sort();
  const period = dates.length > 0
    ? `${dates[0]?.slice(0, 10)} to ${dates[dates.length - 1]?.slice(0, 10)}`
    : 'unknown';

  return {
    entries: records,
    totalRecords: total,
    avgDailyTransits: avg,
    period,
  };
}

// Get historical Area C data (pre-2019)
export async function getAreaCHistorical(limit: number = 100): Promise<AreaCResult> {
  const { records, total } = await queryCKAN(RESOURCE_HISTORICAL, limit);

  const dailyTotals = records
    .map(r => r.numero_transiti_giornalieri ?? 0)
    .filter(v => v > 0);

  const avg = dailyTotals.length > 0
    ? Math.round(dailyTotals.reduce((a, b) => a + b, 0) / dailyTotals.length)
    : 0;

  return {
    entries: records,
    totalRecords: total,
    avgDailyTransits: avg,
    period: 'pre-2019',
  };
}
