// ARPA Lombardia air quality data via Socrata SODA API.
// Two-table join: sensor readings (nicp-bhqi) + station metadata (ib47-atvt).

const READINGS_URL = 'https://www.dati.lombardia.it/resource/nicp-bhqi.json';
const STATIONS_URL = 'https://www.dati.lombardia.it/resource/ib47-atvt.json';

export interface Station {
  idsensore: string;
  nometiposensore: string; // "PM10", "Biossido di Azoto", "Ozono", etc.
  unitamisura: string;
  idstazione: string;
  nomestazione: string;
  comune: string;
  lat: string;
  lng: string;
}

export interface Reading {
  idsensore: string;
  data: string;
  valore: string;
  stato: string;
}

export interface AirQualityResult {
  stations: Station[];
  readings: Reading[];
  summary: Record<string, { avg: number; max: number; min: number; count: number; unit: string }>;
}

// Fetch all Milan air quality stations (small table, ~30-50 rows for Milano)
export async function fetchMilanStations(): Promise<Station[]> {
  const url = `${STATIONS_URL}?$where=comune='Milano' AND storico='N'&$limit=200`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`Stations API ${resp.status}: ${await resp.text()}`);
  return resp.json() as Promise<Station[]>;
}

// Fetch recent readings for a set of sensor IDs
export async function fetchReadings(sensorIds: string[], days: number = 7): Promise<Reading[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  // Batch if too many IDs
  const ids = sensorIds.slice(0, 50).map(id => `'${id}'`).join(',');
  const url = `${READINGS_URL}?$where=idsensore in(${ids}) AND data>'${sinceStr}'&$order=data DESC&$limit=5000`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`Readings API ${resp.status}: ${await resp.text()}`);
  return resp.json() as Promise<Reading[]>;
}

// High-level: get Milan air quality summary with station join
export async function getAirQuality(days: number = 7): Promise<AirQualityResult> {
  const stations = await fetchMilanStations();
  const sensorIds = stations.map(s => s.idsensore);
  const readings = await fetchReadings(sensorIds, days);

  // Filter out invalid readings
  const valid = readings.filter(r => r.valore !== '-9999' && r.valore != null);

  // Build pollutant lookup
  const sensorToPollutant = new Map<string, { name: string; unit: string }>();
  for (const s of stations) {
    sensorToPollutant.set(s.idsensore, { name: s.nometiposensore, unit: s.unitamisura });
  }

  // Compute per-pollutant summary
  const byPollutant = new Map<string, { values: number[]; unit: string }>();
  for (const r of valid) {
    const info = sensorToPollutant.get(r.idsensore);
    if (!info) continue;
    const val = parseFloat(r.valore);
    if (isNaN(val)) continue;
    if (!byPollutant.has(info.name)) {
      byPollutant.set(info.name, { values: [], unit: info.unit });
    }
    byPollutant.get(info.name)!.values.push(val);
  }

  const summary: AirQualityResult['summary'] = {};
  for (const [name, { values, unit }] of byPollutant) {
    summary[name] = {
      avg: +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
      max: Math.max(...values),
      min: Math.min(...values),
      count: values.length,
      unit,
    };
  }

  return { stations, readings: valid.slice(0, 200), summary };
}
