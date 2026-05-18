# Architecture

How the pieces fit together. Read this to understand the codebase.

---

## Overview

```
User                      Cloudflare Worker                     External APIs
 |                              |                                     |
 |  GET /                       |                                     |
 |----------------------------->| serves viewer.ts (HTML)              |
 |                              |                                     |
 |  POST /api/chat              |                                     |
 |  { messages }                |                                     |
 |----------------------------->|                                     |
 |                              |  Gemini 2.5 Flash                   |
 |                              |  (tool-call loop)                   |
 |                              |      |                              |
 |                              |      |-- query_air_quality -------->| ARPA Lombardia
 |                              |      |-- query_area_c ------------->| Comune di Milano
 |                              |      |-- query_trees -------------->| Comune di Milano
 |                              |      |-- query_demographics ------->| Comune di Milano
 |                              |      |-- build_crystal              |
 |                              |      |   (crypto.ts + crystal.ts)   |
 |                              |      |                              |
 |                              |<-----|                              |
 |  { reply, crystal }          |                                     |
 |<-----------------------------|                                     |
 |                              |                                     |
 |  POST /api/crystal/decrypt   |                                     |
 |  { role, memBytesB64 }       |                                     |
 |----------------------------->|                                     |
 |                              |  crystal.ts decryptCrystal()        |
 |  { frames }                  |  (finds stanza, unwraps key,        |
 |<-----------------------------|   decrypts matching frames)          |
```

## Layers

### 1. Data layer (`src/data/`)

Four modules, each wrapping a public API. Each exports a high-level function that fetches, joins, filters, and summarizes.

| Module | API | Pattern |
|--------|-----|---------|
| `air-quality.ts` | Socrata SODA (two-table join) | Fetch stations -> filter to Milan -> fetch readings -> client-side join -> per-pollutant summary |
| `area-c.ts` | CKAN DataStore | Fetch daily entries -> compute average daily transits |
| `trees.ts` | CKAN DataStore | Fetch by municipio/genus -> species counts + dimensional averages |
| `demographics.ts` | CKAN DataStore | Fetch by year/NIL -> population summary |

Data modules return structured results. They don't know about Gemini or crystals.

### 2. Agent layer (`src/gemini.ts` + `src/tools.ts`)

Gemini 2.5 Flash with function calling. The tool-call loop:

1. Send messages + tool declarations to Gemini
2. If Gemini returns function calls, execute them via `tools.ts`
3. Push the full model response (text + function calls) back into conversation contents
4. Accumulate any text the model produced alongside function calls into `collectedText[]`
5. Add tool results to conversation, loop back to Gemini
6. Repeat up to 8 rounds until Gemini returns a text-only response
7. Return all accumulated text (intermediate analysis + final response)

The text accumulation (steps 3-4, 7) is important: Gemini often produces its substantive analysis in the same turn as a `build_crystal` function call. Without accumulation, only the final turn's text (often a terse "crystal ready") would be returned.

`tools.ts` maps each tool name to a data module function. It also handles `build_crystal`, which takes the agent's structured findings and builds a .mem crystal via `crystal.ts`. Individual tool calls are wrapped in try/catch so one failure doesn't crash the round.

Tool results are trimmed before returning to Gemini (sample records, not full datasets) to stay within token limits.

### 3. Crypto layer (`src/crypto.ts` + `src/cbor.ts`)

Pure cryptographic primitives. No application logic. Implements the cipher suite from WALLET_ARCHITECTURE.md:

- **Signing**: Ed25519 with domain separation (`chainge/receipt-sig/v1`)
- **Key exchange**: X25519 ephemeral Diffie-Hellman
- **Key derivation**: HKDF-SHA256 for everything (frame keys, ephemeral keys, nonces, wrapping keys)
- **Encryption**: XChaCha20-Poly1305 (24-byte nonce, 16-byte auth tag)
- **Encoding**: DAG-CBOR via cborg (deterministic, canonical, sorted keys)

**No randomness anywhere.** All keys and nonces are derived via HKDF from the author's private key + deterministic context strings. Same inputs always produce the same encrypted output, the same bytes, the same hash. This is what makes content addressing work for encrypted data.

### 4. Crystal layer (`src/crystal.ts`)

Builds and parses the `.mem` binary format:

```
Bytes 0-3:    Magic           0x4D 0x45 0x4D 0x01  ("MEM" + version 1)
Bytes 4-5:    Header length   uint16 big-endian
Bytes 6-N:    Header          CBOR { v: "chainge/mem/v1", frameCount }
Bytes N+1-M:  Frame table     CBOR [{ label, stanzas[], body }, ...]
```

The .mem bytes are wrapped in a receipt envelope (per ChaingeOS kernel spec):

```
Receipt: CBOR { refs, author, schema, payload: memBytes, signature }
Receipt ID: sha256("chainge/receipt-id/v1" || receiptBytes)
```

**Selective disclosure flow:**

1. For each encrypted frame, derive a frame key from author's X25519 private key + label + content hash
2. Encrypt the frame body with XChaCha20-Poly1305 using the frame key
3. For each recipient, wrap the frame key in a stanza via ephemeral X25519 DH
4. To decrypt: recipient finds their stanza by tag, unwraps the frame key, decrypts the body

Demo uses 3 hardcoded keypairs (author, planner, researcher) derived from known seeds. In production, these would come from the wallet key hierarchy.

### 5. UI layer (`src/viewer.ts` + `src/index.ts`)

Single HTML page served by the Worker. Split layout:

- **Left panel**: Chat interface. Messages, input, loading state. Greeting includes clickable prompt suggestions (event delegation, one-time use).
- **Right panel**: Crystal viewer.
  - Empty state: documentary scene-setter (Po Valley geography, Area C experiment)
  - On crystal arrival: icon pulse, typewriter receipt ID, sequential frame reveal
  - Header: receipt ID, size, frame count
  - Role selector: Public / Planner / Researcher with audience descriptions
  - Role narrative: subtle epistemic annotation that fades in on role switch ("What every Milanese can see." / "What the city must optimize." / "What can be verified independently.")
  - Frame cards: expand/collapse with content or human-readable sealed message
  - Unlock/seal animations on role switch

Role switching calls `/api/crystal/decrypt` server-side. The server finds the matching stanza for the selected role, unwraps the frame key, decrypts the content, and returns the result.

## Key design decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Server-side decryption | Decrypt on Worker, not in browser | Simpler for hackathon. Avoids bundling @noble into client JS. Demo still shows same-bytes-different-content. |
| Demo keypairs | Deterministic from known seeds | Reproducible. Same query always produces the same crystal. |
| Tool results cached | In-memory on Worker | build_crystal can access raw data from prior tool calls without re-querying |
| Single Worker | No KV, no D1, no R2 | Minimal infrastructure. Crystal lives in memory for the session. |
| Gemini 2.5 Flash | Not Pro/Ultra | Fast, cheap, good at function calling. 8 tool rounds is plenty. |
