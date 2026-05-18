# Build Log

Chronological record of what was built, when, and why. This project was built in a single sprint for the AI Agent Olympics (lablab.ai) hackathon, May 18-19, 2026.

---

## Session 1: Scaffold (May 18, ~3:00-3:45 PM CET)

**Goal:** Get from empty repo to compiling project with full architecture in place.

**What was built:**

### Config (5 files)
- `package.json` -- deps: @noble/curves, @noble/hashes, @noble/ciphers, cborg, wrangler
- `wrangler.toml` -- Cloudflare Worker with nodejs_compat flag
- `tsconfig.json` -- ES2022 target, bundler resolution
- `.gitignore` -- node_modules, .wrangler, .dev.vars
- `.dev.vars.example` -- template for GEMINI_API_KEY

### Crypto layer (2 files)
- `src/crypto.ts` -- Full cryptographic primitive set per [WALLET_ARCHITECTURE.md](https://github.com/ericyarmo) Section 1-2:
  - Ed25519 signing/verification with domain separation (`chainge/receipt-sig/v1`)
  - X25519 key exchange for stanza wrapping
  - HKDF-SHA256 for all key/nonce derivation (deterministic, no randomness)
  - XChaCha20-Poly1305 for frame body encryption
  - Stanza wrapping: ephemeral DH, derived wrapping key, derived nonce
  - Stanza unwrapping: reverse DH with recipient private key
  - Key derivation from seed: signing key + encryption key per hierarchy level
  - Receipt ID: `sha256("chainge/receipt-id/v1" || receipt_bytes)`
  - Utility: hex encode/decode, stanza matching by recipient tag
- `src/cbor.ts` -- Thin wrapper over cborg for DAG-CBOR encode/decode

### Crystal builder (1 file)
- `src/crystal.ts` -- Full .mem wrapper implementation:
  - Binary format: magic `MEM\x01` + uint16 header length + CBOR header + CBOR frame table
  - Header: `{ v: "chainge/mem/v1", frameCount }` 
  - Frame table: array of `{ label, stanzas[], body }` where body is plaintext (public) or ciphertext (encrypted)
  - Frame key derivation: `HKDF(author_encrypt_priv, "chainge/frame-key/v1" || label || sha256(plaintext))`
  - Stanza wrapping for planner and researcher recipients
  - Receipt envelope: `{ refs, author, schema, payload: memBytes, signature }`
  - Parsing: validates magic, decodes header + frame table
  - Decryption: finds matching stanza by recipient tag, unwraps frame key, decrypts body
  - Demo keypairs: deterministic from known seeds (author, planner, researcher)
  - Base64 encode/decode for transport

### Data layer (4 files)
All endpoints confirmed via API research. Real dataset IDs, real field names.

- `src/data/air-quality.ts` -- ARPA Lombardia via Socrata SODA API
  - Sensor readings: `dati.lombardia.it/resource/nicp-bhqi.json`
  - Station metadata: `dati.lombardia.it/resource/ib47-atvt.json` (join table for sensor -> pollutant + location)
  - Client-side join, filters to Milano stations, computes per-pollutant summary stats
  - Handles invalid readings (`-9999` values)

- `src/data/area-c.ts` -- Milan CKAN DataStore API
  - Current (2019+): resource `b25e13d8-7fcb-46e3-b1e9-ff81b18f5c84`
  - Historical (pre-2019): resource `c2f46ef8-9ee8-4883-807d-93adeb1b9931`
  - Daily vehicle entry counts, time-band splits, average daily transits

- `src/data/trees.ts` -- Milan CKAN DataStore API
  - Resource: `604dd6bb-7ec8-4262-babb-1fa392f864cc` (251K rows)
  - Filter by municipio (1-9) or genus
  - Species counts, average height/crown diameter
  - SQL count endpoint for efficient municipio totals

- `src/data/demographics.ts` -- Milan CKAN DataStore API
  - Resource: `084457a7-ec4b-4a6b-b463-d8ab53c64fbb` (88 NILs x 13 years)
  - Population, foreign residents, births, deaths, migration, elderly cohorts
  - Auto-detects latest year if not specified

### Agent layer (2 files)
- `src/tools.ts` -- 5 Gemini tool declarations + execution:
  - `query_air_quality` -- ARPA sensor data with pollutant summary
  - `query_area_c` -- congestion zone entries (current or historical)
  - `query_trees` -- tree inventory by municipio/genus with species stats
  - `query_demographics` -- NIL-level population data
  - `build_crystal` -- packages tool results into a .mem crystal with 3 frames
  - Caches tool results for crystal building context
  - Returns structured summaries to Gemini (not raw API responses)

- `src/gemini.ts` -- Ported from chaingestl agent with new system prompt:
  - Gemini 2.5 Flash with function calling
  - Up to 8 tool-call rounds per message
  - System prompt covers all 4 data sources, query strategies, crystal frame structure
  - Instructs agent to always build_crystal after multi-dataset queries

### UI + Entry (2 files)
- `src/viewer.ts` -- Single HTML page with embedded CSS + JS:
  - Split layout: chat panel (left) + crystal viewer (right)
  - Dark theme, monospace font
  - Chat: message history, loading animation, markdown bold rendering
  - Crystal viewer: receipt ID, size, frame count stats
  - Role selector: Public / Planner / Researcher buttons
  - Frame cards: label, status badge (VIEWABLE/SEALED), content rendering
  - Unlock animation: glow effect on frame transition, fade on seal
  - Recursive key-value renderer for arbitrary crystal content
  - Responsive: stacks vertically on mobile

- `src/index.ts` -- Cloudflare Worker routes:
  - `GET /` -- serves viewer HTML
  - `POST /api/chat` -- Gemini chat with tool execution, returns reply + crystal if built
  - `POST /api/crystal/decrypt` -- decrypts crystal frames for a given role
  - CORS headers on all responses

### Build result
- **Compiles clean**: zero errors
- **Bundle size**: 221 KB raw, 56 KB gzipped
- **Source files**: 12
- **Dependencies**: 4 runtime (@noble/curves, @noble/hashes, @noble/ciphers, cborg), 3 dev (wrangler, typescript, @cloudflare/workers-types)

### Known gaps (to address in next session)
- Not yet tested with live Gemini API key
- No error boundaries in viewer JS
- Data module edge cases (API timeouts, empty responses) need testing
- Crystal viewer doesn't show download/export button yet
- No README cover image or submission materials
- System prompt may need tuning after seeing real tool results

---

## Dataset API Reference

Quick reference for the live endpoints used by the data modules.

### ARPA Lombardia (Socrata SODA)
```
Readings:  https://www.dati.lombardia.it/resource/nicp-bhqi.json
Stations:  https://www.dati.lombardia.it/resource/ib47-atvt.json
```
- Join on `idsensore`
- Station table resolves sensor -> pollutant name + lat/lng
- Filter: `$where=comune='Milano' AND storico='N'`
- Invalid readings: `valore = -9999`

### Milan CKAN DataStore
```
Base: https://dati.comune.milano.it/api/3/action/datastore_search
SQL:  https://dati.comune.milano.it/api/3/action/datastore_search_sql
```

| Dataset | Resource ID | Rows |
|---------|-------------|------|
| Area C (2019+) | `b25e13d8-7fcb-46e3-b1e9-ff81b18f5c84` | ~305 |
| Area C (pre-2019) | `c2f46ef8-9ee8-4883-807d-93adeb1b9931` | ~1,781 |
| Trees | `604dd6bb-7ec8-4262-babb-1fa392f864cc` | 251,165 |
| Demographics | `084457a7-ec4b-4a6b-b463-d8ab53c64fbb` | 1,154 |

- Default limit: 100 rows. Max: 32,000.
- Use `offset` for paging.
- Filters: `filters={"field":"value"}`
- Area C Euro-class breakdowns only exist 2012-2016 (separate datasets).
- Demographics `Area (metri quadrati)` is text with Italian comma decimal.
- All datasets CC-BY. ARPA Lombardia is CC0.

---

## Session 2: Agent Reasoning + Viewer Polish (May 18, ~4:00-5:00 PM CET)

**Goal:** Fix multi-tool query crash, make Gemini actually reason across datasets, polish viewer copy for accessibility.

### Bugs fixed

- **Multi-tool query crash** (`Cannot read properties of undefined (reading 'parts')`):
  - Root cause: `candidate.content` can be undefined when Gemini returns a candidate without content (safety filter, empty response). Line `candidate.content.parts` would throw.
  - Fix: Guard with `candidate?.content?.parts` check, retry on empty candidates, log the `finishReason`.

- **Model response echo bug**: When Gemini returned text + function calls in the same turn, we only pushed the function call parts back into the conversation contents. Gemini expects to see its own full response echoed. Changed to push all parts (text + function calls).

- **Lost analysis text**: The model's substantive analysis was generated in intermediate turns (alongside function calls like `build_crystal`), but only the final turn's text was returned. The final turn was often a terse "crystal built" message. Fixed by accumulating text from all model turns across the tool-call loop via `collectedText[]` array.

### Agent improvements

- **System prompt rewrite** (`gemini.ts`):
  - Added explicit reasoning directives: look for CONTRASTS, SURPRISES, EQUITY GAPS, POLICY STORIES
  - "DON'T just list numbers from each dataset. CONNECT them."
  - "ALWAYS give the user an insight they couldn't get from a dashboard."
  - Stronger crystal frame guidance: public = newspaper lede, planner = policy analysis, researcher = methodology
  - Added Milan context: Po Valley geography, Area C as natural experiment, uneven tree distribution
  - Fixed FIRST MESSAGE instruction to only greet on generic hellos, not real questions
  - Added instruction to always include full analysis in chat reply after crystal building

- **max_output_tokens**: Bumped from 2048 to 4096. The model was truncating reasoning on complex multi-dataset queries.

- **Tool execution error handling**: Wrapped individual tool calls in try/catch inside the loop so one failed tool doesn't crash the entire round.

### Viewer copy overhaul (`viewer.ts`)

All changes aimed at making the crystal concept accessible to non-technical users.

- **Header subtitle**: Changed from "climate intelligence for Milan -- selective disclosure via memory crystals" to "AI queries live Milan data. The report it builds shows different things to different people."
- **Role buttons**: Added one-liner descriptions under each:
  - Public: "What any citizen sees"
  - Planner: "What a city official unlocks"
  - Researcher: "What an academic unlocks"
- **Crystal empty state**: Changed from "forge a memory crystal with selective disclosure frames" to "The agent will build a report that reveals different content depending on who's reading it."
- **Crystal viewer intro**: Added "One file. Same bytes. Toggle roles to see how different keys reveal different content."
- **Sealed frame messages**: Changed from "Encrypted. Requires planner key to decrypt." to "This section is locked. Only city planners can read it."

### Test results

- Multi-tool queries now work end-to-end (air quality + Area C + trees + demographics)
- Selective disclosure verified across all 3 roles (public sees 1 frame, planner sees 2, researcher sees 2)
- Agent produces substantive cross-dataset analysis (e.g., "traffic went UP but particulate matter stayed LOW -- fleet modernization?")
- Crystal sizes: 2,200-3,500 bytes for typical 3-frame crystals

### Build result
- **Bundle size**: 225 KB raw, 57.5 KB gzipped (up ~1.5 KB from viewer copy additions)
- **Zero errors**

---

## Session 3: Atmosphere, Narrator Voice, Data Fix (May 18, ~5:30-6:30 PM CET)

**Goal:** Add emotional/narrative framing without being cinematic. Fix the "green cover per person" question that was punting. Add clickable prompt suggestions.

### Design principle
Archival, infrastructural, geographic, consequential. Not gamified, not startup-polished, not sci-fi cosplay. The interface should feel like entering a living civic condition, not opening a dashboard.

### Scene-setter (crystal empty state)
Replaced generic "No crystal yet" placeholder with documentary framing:

> *Milan sits in the Po Valley. The mountains trap the air. For 14 years, the city has been running an experiment: can you price cars out of the center and make people breathe easier?*
>
> Ask a question. The data remembers.

Under 4 lines. Establishes stakes and geography before the user asks anything.

### Role toggle narrative
Added a subtle one-line epistemic annotation that fades in (200ms) on role switch above the crystal frames:
- Public: "What every Milanese can see."
- Planner: "What the city must optimize."
- Researcher: "What can be verified independently."

Styled as italic, low-opacity text. Archival annotation, not onboarding copy.

### Agent narrator voice (system prompt)
Added guidance to open each response with one grounded, geographic, human-scale sentence before the analytical headline. Uses real landmarks and neighborhoods.

Examples from live output:
- "Around the historic Duomo and Galleria Vittorio Emanuele II, the daily rhythm of traffic has been deliberately altered for over a decade..."
- "In the heart of Milan, where the Duomo stands sentinel..."

Explicit tone guidance: "investigative researcher, museum placard, documentary narrator. Never startup marketing, never climate doomposting, never sci-fi."

### Crystal arrival animation
- Diamond icon pulses once on crystal generation (0.8s ease-out)
- Receipt ID types in character-by-character (30ms/char, ~500ms total)
- Frames reveal sequentially with 200ms stagger between each
- Crystal header, role selector, and narrative cascade in over ~400ms
- No spinning loaders or excessive motion

### Clickable prompt suggestions
Greeting message suggested questions render as clickable links (dotted underline, accent color). Clicking sends the prompt directly.
- Uses event delegation on messages container (not inline onclick) for reliability
- Regex detects bullet-point questions ending in `?`, handles optional smart quotes
- Links are one-time use: clicking one removes all prompt links from the greeting
- `href="#"` with `preventDefault()` for proper browser interactivity

### Data fix: green cover per person
The "Which neighborhoods have the least green cover per person?" prompt was causing the agent to apologize about data resolution (trees are per-municipio, demographics per-NIL) and ask the user if municipio-level was OK.

Fixed in three places:
1. **`trees.ts`**: Added `getTreeCountsByMunicipio()` -- one SQL `GROUP BY` query that returns all 9 municipio tree counts in a single call
2. **`tools.ts`**: Added `compare_municipi` parameter to `query_trees` tool. When true, returns tree counts for all 9 municipi instead of individual tree records
3. **`gemini.ts`**: Added DATA RESOLUTION section to system prompt: "If the user asks about neighborhoods, answer at the municipio level. DO NOT apologize about data resolution... NEVER punt a question."

### Other fixes
- **max_output_tokens**: Bumped from 4096 to 8192. Complex multi-dataset queries with crystal building were hitting the token limit
- **Empty candidate fallback**: When Gemini returns no content after tool execution, now returns collected text from earlier rounds instead of error message

### Build result
- **Bundle size**: 232 KB raw, 59.9 KB gzipped
- **Zero errors**
- All 3 suggested prompts tested and working end-to-end with crystals
