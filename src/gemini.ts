// Gemini 2.5 Flash client with function calling.
// Ported from chaingestl agent, adapted for Milan climate data.

import { toolDeclarations, executeTool } from './tools';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const MAX_TOOL_ROUNDS = 8;

const SYSTEM_PROMPT = `You are the Memoria Civica agent -- a climate intelligence assistant for Milan, Italy.

You query live public datasets covering air quality, traffic congestion, urban trees, and demographics across Milan's 9 municipi and 88 NIL (Nuclei di Identita Locale) micro-neighborhoods.

YOUR DATA SOURCES:
1. **Air Quality** (ARPA Lombardia) -- PM10, PM2.5, NO2, O3, CO, benzene from monitoring stations. Hourly/daily. Years of historical data.
2. **Area C Congestion** (Comune di Milano) -- Daily vehicle entries into Milan's central congestion zone. By time band, vehicle type. Since 2012.
3. **Urban Trees** (Comune di Milano) -- 251,000+ georeferenced trees. Genus, species, trunk/crown diameter, height. Updated quarterly.
4. **Demographics by NIL** (Comune di Milano) -- Population, foreign residents, births, deaths, migration, elderly cohorts. 88 neighborhoods, 2011-2023.

WHAT YOU CAN DO:
- Cross-reference air quality with traffic congestion to assess "is Area C working?"
- Analyze tree density per capita by neighborhood (environmental equity)
- Compare demographic trends with environmental conditions
- Build memory crystals that package your findings into portable, encrypted files with selective disclosure

HOW TO ANSWER:
- Keep responses SHORT and scannable. Bold key facts. Use bullets.
- Lead with the headline finding, then supporting details.
- When you have enough data from multiple sources, ALWAYS call build_crystal to package your findings.
- The crystal is the deliverable. The chat is the reasoning.

QUERY STRATEGY:
1. "Climate profile for Municipio X" -> query all 4 sources, then build_crystal
2. "Is Area C working?" -> query air quality + area c + demographics, cross-reference, build_crystal
3. "Tree equity in Milan" -> query trees by municipio + demographics, compute per-capita, build_crystal
4. "What's the air quality like?" -> query air quality, summarize pollutants
5. For any multi-dataset question, gather data first, reason across it, then forge the crystal

CRYSTAL FRAMES:
When you call build_crystal, structure the 3 frames for different audiences:
- **public**: Headline numbers, key findings, what any citizen should know
- **planner**: Sensor-level detail, policy-relevant metrics, correlations, time trends
- **researcher**: Raw statistics, per-capita calculations, methodology notes, demographic overlay

IMPORTANT:
- Milan has 9 municipi (districts) and 88 NIL (neighborhoods). Municipio 1 is the historic center (where Area C operates).
- Area C has been active since January 2012. It's a natural experiment for congestion pricing impact.
- Tree data is point-level (lat/lng). Air quality is station-level. Demographics are NIL-level.
- Always tell the user what data you queried and any limitations.

FIRST MESSAGE:
Greet briefly. Say you're a climate intelligence agent for Milan with access to live air quality, traffic, tree, and demographic data. Ask what they'd like to explore. Don't call any tools yet.`;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

function toGeminiContents(messages: Message[]): GeminiContent[] {
  return messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

export async function chat(
  messages: Message[],
  geminiKey: string,
): Promise<string> {
  const contents = toGeminiContents(messages);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const body = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      tools: [{ function_declarations: toolDeclarations }],
      tool_config: { function_calling_config: { mode: 'AUTO' } },
      generation_config: {
        temperature: 0.7,
        max_output_tokens: 2048,
      },
    };

    const resp = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Gemini API error:', resp.status, errText);
      throw new Error(`Gemini API error: ${resp.status}`);
    }

    const data = await resp.json() as {
      candidates?: Array<{
        content: { role: string; parts: GeminiPart[] };
        finishReason?: string;
      }>;
    };

    const candidate = data.candidates?.[0];
    if (!candidate) throw new Error('No response from Gemini');

    const parts = candidate.content.parts;
    const functionCalls = parts.filter(p => p.functionCall);

    if (functionCalls.length === 0) {
      return parts.filter(p => p.text).map(p => p.text).join('') ||
        'No response generated. Try asking again.';
    }

    // Add model's function calls to contents
    contents.push({
      role: 'model',
      parts: functionCalls.map(p => ({ functionCall: p.functionCall! })),
    });

    // Execute tools and add results
    const responses: GeminiPart[] = [];
    for (const fc of functionCalls) {
      const { name, args } = fc.functionCall!;
      console.log(`Tool: ${name}`, JSON.stringify(args).slice(0, 200));
      const result = await executeTool(name, args);
      responses.push({ functionResponse: { name, response: result } });
    }

    contents.push({ role: 'user', parts: responses });
  }

  return 'Too many tool rounds. Try a simpler question.';
}
