// Gemini tool declarations and execution for Milan climate data + crystal building.

import { getAirQuality } from './data/air-quality';
import { getAreaC, getAreaCHistorical } from './data/area-c';
import { getTrees, getTreeCount, getTreeCountsByMunicipio } from './data/trees';
import { getDemographics } from './data/demographics';
import { buildCrystal, type FrameInput } from './crystal';

// --- Tool declarations for Gemini function calling ---

export const toolDeclarations = [
  {
    name: 'query_air_quality',
    description: 'Get air quality data for Milan from ARPA Lombardia monitoring stations. Returns PM10, PM2.5, NO2, O3, and other pollutant readings with per-pollutant averages, min, max. Data is hourly for gaseous pollutants and daily for particulate matter.',
    parameters: {
      type: 'object',
      properties: {
        days: {
          type: 'integer',
          description: 'Number of days of data to fetch (default 7, max 30)',
        },
      },
    },
  },
  {
    name: 'query_area_c',
    description: 'Get Area C congestion charge data for Milan. Area C is the congestion pricing zone in central Milan (Municipio 1), active since January 2012. Returns daily vehicle entry counts split by time band and vehicle type (cars vs motorcycles). Use this to analyze traffic patterns and congestion pricing effects.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: 'Number of recent daily records to fetch (default 100)',
        },
        historical: {
          type: 'boolean',
          description: 'If true, fetch pre-2019 historical data instead of current',
        },
      },
    },
  },
  {
    name: 'query_trees',
    description: 'Get tree inventory data for Milan. 251,000+ georeferenced municipal trees with genus, species, trunk diameter, crown diameter, and height. Can filter by municipio (1-9) or genus name. Set compare_municipi=true to get tree counts for ALL 9 municipi in one call (useful for equity/per-capita comparisons). Use this for urban green infrastructure, environmental equity, and heat island analysis.',
    parameters: {
      type: 'object',
      properties: {
        municipio: {
          type: 'integer',
          description: 'Milan municipio number (1-9) to filter by',
        },
        genus: {
          type: 'string',
          description: 'Tree genus to filter by, e.g. "Platanus", "Tilia", "Acer"',
        },
        limit: {
          type: 'integer',
          description: 'Max records to return (default 200)',
        },
        compare_municipi: {
          type: 'boolean',
          description: 'If true, return tree counts for all 9 municipi (ignores other filters). Use this for cross-district comparisons.',
        },
      },
    },
  },
  {
    name: 'query_demographics',
    description: 'Get demographic data for Milan by NIL (Nuclei di Identita Locale -- 88 micro-neighborhoods). Includes population, gender, minors, foreign residents, births, deaths, migration, elderly cohorts, top foreign nationalities, and area. Data from 2011-2023.',
    parameters: {
      type: 'object',
      properties: {
        year: {
          type: 'integer',
          description: 'Year to query (2011-2023, default latest)',
        },
        neighborhood: {
          type: 'string',
          description: 'NIL name, e.g. "Duomo", "Brera", "Navigli"',
        },
      },
    },
  },
  {
    name: 'build_crystal',
    description: 'Build a memory crystal that packages civic data findings into a portable, selectively disclosable file. The crystal has 3 frames: (1) PUBLIC -- aggregate summary anyone can see, (2) PLANNER -- detailed data for city officials, (3) RESEARCHER -- raw data with demographic context for academics. Call this after you have gathered data from the other tools and want to package it for the user.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Crystal title, e.g. "Municipio 1 Climate Profile, May 2026"',
        },
        public_summary: {
          type: 'object',
          description: 'Aggregate findings for the public frame (key facts, headline numbers)',
        },
        planner_data: {
          type: 'object',
          description: 'Detailed findings for the city planner frame (sensor-level data, correlations, policy-relevant metrics)',
        },
        researcher_data: {
          type: 'object',
          description: 'Raw data with demographic overlay for the researcher frame (time series, per-capita metrics, methodology notes)',
        },
      },
      required: ['title', 'public_summary', 'planner_data', 'researcher_data'],
    },
  },
];

// --- Tool execution ---

// Store the last crystal result so the viewer can fetch it
let lastCrystal: ReturnType<typeof buildCrystal> | null = null;
export function getLastCrystal() { return lastCrystal; }

// Capture raw tool results for crystal building context
const toolResultsCache: Record<string, unknown> = {};
export function getToolResults() { return toolResultsCache; }

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  try {
    switch (name) {
      case 'query_air_quality': {
        const days = Math.min(Number(args.days) || 7, 30);
        const result = await getAirQuality(days);
        toolResultsCache.airQuality = result;
        return {
          pollutants: result.summary,
          stationCount: result.stations.length,
          readingCount: result.readings.length,
          sampleReadings: result.readings.slice(0, 10),
        };
      }

      case 'query_area_c': {
        const limit = Number(args.limit) || 100;
        const result = args.historical
          ? await getAreaCHistorical(limit)
          : await getAreaC(limit);
        toolResultsCache.areaC = result;
        return {
          avgDailyTransits: result.avgDailyTransits,
          totalRecords: result.totalRecords,
          period: result.period,
          sampleEntries: result.entries.slice(0, 10),
        };
      }

      case 'query_trees': {
        // Compare all municipi mode
        if (args.compare_municipi) {
          const counts = await getTreeCountsByMunicipio();
          toolResultsCache.treeCounts = counts;
          return {
            mode: 'compare_municipi',
            treesByMunicipio: counts,
            totalTrees: Object.values(counts).reduce((a, b) => a + b, 0),
          };
        }

        const municipio = args.municipio ? Number(args.municipio) : undefined;
        const genus = args.genus ? String(args.genus) : undefined;
        const limit = Number(args.limit) || 200;
        const result = await getTrees(municipio, genus, limit);

        // Also get total count if filtering by municipio
        let totalInMunicipio: number | undefined;
        if (municipio) {
          totalInMunicipio = await getTreeCount(municipio);
        }

        toolResultsCache.trees = result;
        return {
          totalRecords: totalInMunicipio ?? result.totalRecords,
          speciesCounts: result.speciesCounts,
          avgHeight: result.avgHeight,
          avgCrownDiameter: result.avgCrownDiameter,
          sampleTrees: result.trees.slice(0, 10).map(t => ({
            genus: t.genere,
            species: t.specie,
            height: t.h_m,
            crownDiameter: t.diam_chiom,
            municipio: t.municipio,
          })),
        };
      }

      case 'query_demographics': {
        const year = args.year ? Number(args.year) : undefined;
        const nilName = args.neighborhood ? String(args.neighborhood) : undefined;
        const result = await getDemographics(year, nilName);
        toolResultsCache.demographics = result;
        return {
          year: result.year,
          totalPopulation: result.totalPopulation,
          foreignPercent: result.foreignPercent,
          totalRecords: result.totalRecords,
          sampleRecords: result.records.slice(0, 10).map(r => ({
            neighborhood: r.Quartiere,
            nil: r.NIL,
            population: r.Totale,
            foreignResidents: r.Stranieri,
            minors: r.Minori,
            elderly65: r['65 e piu'],
          })),
        };
      }

      case 'build_crystal': {
        const frames: FrameInput[] = [
          {
            label: 'public',
            content: {
              title: args.title,
              type: 'civic-climate-profile',
              generated: new Date().toISOString(),
              ...(args.public_summary as Record<string, unknown> || {}),
            },
            isPublic: true,
          },
          {
            label: 'planner',
            content: {
              title: args.title,
              audience: 'city-planner',
              ...(args.planner_data as Record<string, unknown> || {}),
            },
            isPublic: false,
          },
          {
            label: 'researcher',
            content: {
              title: args.title,
              audience: 'researcher',
              ...(args.researcher_data as Record<string, unknown> || {}),
            },
            isPublic: false,
          },
        ];

        const crystal = buildCrystal(frames);
        lastCrystal = crystal;

        return {
          status: 'crystal_forged',
          receiptId: crystal.receiptId,
          memSize: crystal.memSize,
          receiptSize: crystal.receiptSize,
          frames: crystal.frames,
          message: `Crystal forged: ${crystal.memSize} bytes, ${crystal.frames.length} frames. Receipt ID: ${crystal.receiptId.slice(0, 16)}...`,
        };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    console.error(`Tool ${name} failed:`, err);
    return { error: `Tool ${name} failed: ${err}` };
  }
}
