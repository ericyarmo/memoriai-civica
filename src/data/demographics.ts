// Milan demographics by NIL (Nuclei di Identita Locale) via CKAN DataStore API.
// 88 NILs x 13 years (2011-2023).

const CKAN_BASE = 'https://dati.comune.milano.it/api/3/action/datastore_search';
const RESOURCE_ID = '084457a7-ec4b-4a6b-b463-d8ab53c64fbb';

export interface NILRecord {
  Anno: number;
  Quartiere: string;        // neighborhood name
  NIL: number;              // NIL number (1-88)
  Uomini: number;
  Donne: number;
  Totale: number;
  Minori: number;
  Stranieri: number;
  'Famiglie registrate in anagrafe': number;
  'Nati vivi': number;
  Morti: number;
  Emigrati: number;
  Immigrati: number;
  '80 e piu': number;
  '65 e piu': number;
  'Prima cittadinanza': string;
  'Seconda cittadinanza': string;
  'Terza cittadinanza': string;
  'Area (metri quadrati)': string; // text with Italian comma decimal
  [key: string]: unknown;
}

export interface DemographicsResult {
  records: NILRecord[];
  totalRecords: number;
  year: number;
  totalPopulation: number;
  foreignPercent: number;
}

export async function getDemographics(
  year?: number,
  nilName?: string,
  limit: number = 200,
): Promise<DemographicsResult> {
  const filters: Record<string, unknown> = {};
  if (year) filters.Anno = year;
  if (nilName) filters.Quartiere = nilName;

  const params = new URLSearchParams({
    resource_id: RESOURCE_ID,
    limit: String(limit),
    sort: 'Anno desc, Quartiere asc',
  });
  if (Object.keys(filters).length > 0) {
    params.set('filters', JSON.stringify(filters));
  }

  const resp = await fetch(`${CKAN_BASE}?${params}`);
  if (!resp.ok) throw new Error(`Demographics API ${resp.status}: ${await resp.text()}`);
  const data = await resp.json() as { result: { records: NILRecord[]; total: number } };
  const { records, total } = data.result;

  // If no year specified, determine the latest year
  const usedYear = year || Math.max(...records.map(r => r.Anno));

  // Filter to the used year for summary stats
  const yearRecords = records.filter(r => r.Anno === usedYear);
  const totalPop = yearRecords.reduce((sum, r) => sum + (r.Totale || 0), 0);
  const totalForeign = yearRecords.reduce((sum, r) => sum + (r.Stranieri || 0), 0);

  return {
    records,
    totalRecords: total,
    year: usedYear,
    totalPopulation: totalPop,
    foreignPercent: totalPop > 0 ? +((totalForeign / totalPop) * 100).toFixed(1) : 0,
  };
}
