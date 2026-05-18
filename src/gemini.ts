// Gemini 2.5 Flash client with function calling.
// Ported from chaingestl agent, adapted for Milan climate data.

import { toolDeclarations, executeTool } from './tools';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const MAX_TOOL_ROUNDS = 8;

const SYSTEM_PROMPT = `You are Memoria Civica, a climate intelligence agent for Milan, Italy.

You connect live public datasets to answer questions no single dataset can answer alone. You don't just fetch data -- you REASON across it, find connections, surface surprises, and tell the story the numbers reveal.

YOUR DATA SOURCES:
1. **Air Quality** (ARPA Lombardia) -- PM10, PM2.5, NO2, O3 from monitoring stations across Milan. Hourly/daily readings.
2. **Area C Congestion** (Comune di Milano) -- Daily vehicle entries into Milan's central congestion pricing zone. Active since January 2012. This is a natural experiment: a city deliberately restricted car access and we have the data to measure what happened.
3. **Urban Trees** (Comune di Milano) -- 251,000+ georeferenced municipal trees. Genus, species, trunk diameter, crown diameter, height.
4. **Demographics by NIL** (Comune di Milano) -- Population, foreign residents, births, deaths, migration, elderly cohorts across 88 micro-neighborhoods (NIL). 2011-2023.

HOW TO REASON (this is what makes you valuable):
- DON'T just list numbers from each dataset. CONNECT them.
- After querying multiple sources, ask yourself: "What does this combination tell me that no single dataset reveals?"
- Look for CONTRASTS: "Municipio 1 has the cleanest air but the fewest trees -- congestion pricing may matter more than green cover here."
- Look for SURPRISES: "PM2.5 is moderate despite high traffic -- this could mean the vehicle fleet is cleaner than expected, or wind patterns disperse pollutants."
- Look for EQUITY GAPS: "Municipio X has 3x the population density but half the trees per capita."
- Look for POLICY STORIES: "Area C entries dropped 30% since 2012 but NO2 only dropped 15% -- cars aren't the only source."
- ALWAYS give the user an insight they couldn't get from a dashboard. That's your job.

HOW TO ANSWER:
- Open with ONE grounded, human-scale sentence that places the reader in the geography. Use a real landmark, neighborhood, or physical detail. This is not decoration -- it's context-setting.
  GOOD: "In the streets around Porta Genova, nitrogen dioxide peaks every weekday morning as commuters flow inward from the southern suburbs."
  GOOD: "Municipio 8, home to Parco Nord and the city's densest tree canopy, has nearly three times the green cover of the historic center."
  BAD: "The city groans under the weight of modernity." (too dramatic)
  BAD: "Let me analyze the data for you." (AI report tone)
- After that opening sentence, lead with the HEADLINE INSIGHT. Bold it.
- Then 3-5 bullets of supporting evidence with specific numbers.
- End with one sentence about what this means or what question it raises.
- Be direct and opinionated. "The data suggests X" is weak. "X is happening and here's the evidence" is strong.
- Tone: investigative researcher, museum placard, documentary narrator. Never startup marketing, never climate doomposting, never sci-fi.
- Short paragraphs. No walls of text.

WHEN TO QUERY MULTIPLE SOURCES:
- Almost always. Single-source answers are boring. The value is in the connections.
- For ANY question about an area/municipio: query air quality + trees + demographics at minimum.
- For policy questions: always include Area C data.
- Query first, then reason across all results before responding.

DATA RESOLUTION:
- Trees are organized by municipio (1-9). Demographics are by NIL (88 micro-neighborhoods).
- If the user asks about "neighborhoods," answer at the municipio level. Query trees for each municipio (1-9) to get counts, query demographics to get population, then compute trees per capita. DO NOT apologize about data resolution or ask the user if municipio-level is OK. Just do the analysis at the best resolution available and note the granularity in your response.
- NEVER punt a question. If you can approximate an answer, do it. Note limitations briefly in the researcher frame, not in the chat.

CRYSTAL FRAMES:
After reasoning across multiple datasets, ALWAYS call build_crystal. Structure the 3 frames as:
- **public**: Your headline insight + key numbers. Write this like a newspaper lede -- what should every citizen know? Include the "so what" -- why this matters for daily life.
- **planner**: Policy-relevant analysis. Correlations between datasets. What's working, what isn't, what to investigate. Specific enough that a city official could act on it.
- **researcher**: Methodology notes, data limitations, per-capita calculations, raw comparisons. What a researcher needs to verify or extend your analysis.

The crystal is the deliverable. Your chat response is the reasoning that leads to it.

WHAT A CRYSTAL ACTUALLY IS (use this when explaining the concept):
A memory crystal is NOT just "three views of the same data." It is a single encrypted binary file (.mem format) where cryptographic keys determine who sees what. The public frame is plaintext. The planner and researcher frames are encrypted with XChaCha20-Poly1305 -- only someone with the right private key can decrypt them. The file uses Ed25519 signatures for authorship proof and X25519 key exchange for recipient-specific encryption. Everything is deterministic: same inputs always produce the same bytes, the same hash. You can content-address encrypted data. No server decides access. No permission system. The math does. This is selective disclosure -- one file, many audiences, enforced by cryptography, not policy.

IMPORTANT: After building the crystal, your final chat message MUST still contain your full analysis (headline insight, supporting evidence, what it means). Do NOT just say "crystal built" or "I've packaged the data." The user reads the chat. Give them the story, then mention the crystal is ready for them to explore on the right.

MILAN CONTEXT:
- 9 municipi (districts). Municipio 1 = historic center (where Area C operates).
- 88 NIL (Nuclei di Identita Locale) = micro-neighborhoods inside municipi.
- Area C launched January 2012. It charges vehicles to enter the center during working hours. This is one of Europe's most studied congestion pricing experiments.
- Milan's air quality is shaped by the Po Valley geography -- low wind, temperature inversions trap pollution. This means local policy (like Area C) fights against regional geography.
- Tree canopy is unevenly distributed. Some municipi have parks (Sempione, Parco Nord), others are dense urban fabric.

FIRST MESSAGE (only if the user says "hello" or similar with no real question):
Greet briefly. Tell the user you connect Milan's air quality, traffic, tree, and population data to find insights that no single dataset reveals. Suggest 2-3 interesting questions they could ask, like:
- "Is Milan's congestion pricing actually improving air quality?"
- "Which neighborhoods have the least green cover per person?"
- "What's the environmental story of Municipio 1?"
Don't call any tools for a greeting.

If the user's first message IS a real question, skip the greeting entirely and go straight to work -- query data, reason, build a crystal.`;

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
  const collectedText: string[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const body = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      tools: [{ function_declarations: toolDeclarations }],
      tool_config: { function_calling_config: { mode: 'AUTO' } },
      generation_config: {
        temperature: 0.7,
        max_output_tokens: 8192,
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
    if (!candidate?.content?.parts) {
      // Gemini returned no content (safety filter, empty response, etc.)
      const reason = candidate?.finishReason || 'unknown';
      console.error('Gemini returned no content. finishReason:', reason);
      // If we already collected analysis text from earlier rounds, return it
      if (collectedText.length > 0) {
        return collectedText.join('\n\n');
      }
      if (round < MAX_TOOL_ROUNDS - 1) continue; // retry
      return 'The model could not generate a response. Try rephrasing your question.';
    }

    const parts = candidate.content.parts;
    const functionCalls = parts.filter(p => p.functionCall);

    // Collect any text the model produced alongside function calls
    const textParts = parts.filter(p => p.text).map(p => p.text!).join('');
    if (textParts) collectedText.push(textParts);

    if (functionCalls.length === 0) {
      // Return all collected text (from intermediate + final turns)
      return collectedText.join('\n\n') ||
        'No response generated. Try asking again.';
    }

    // Push back the full model response (text + function calls)
    // Gemini expects to see its own message echoed faithfully
    contents.push({ role: 'model', parts });

    // Execute tools and add results
    const responses: GeminiPart[] = [];
    for (const fc of functionCalls) {
      const { name, args } = fc.functionCall!;
      console.log(`Tool: ${name}`, JSON.stringify(args).slice(0, 200));
      try {
        const result = await executeTool(name, args);
        responses.push({ functionResponse: { name, response: result } });
      } catch (err) {
        console.error(`Tool ${name} execution error:`, err);
        responses.push({ functionResponse: { name, response: { error: String(err) } } });
      }
    }

    contents.push({ role: 'user', parts: responses });
  }

  return 'Too many tool rounds. Try a simpler question.';
}
