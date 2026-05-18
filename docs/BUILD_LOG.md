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
