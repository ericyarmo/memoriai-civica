# memoriai-civica -- Agent Directions

**What this is:** A climate intelligence agent for Milan that forges memory crystals with selective disclosure. Built for the AI Agent Olympics hackathon (lablab.ai), May 18-19, 2026.

**Status:** Scaffold complete. Not yet tested with live Gemini API key.

---

## Quick start

```bash
cp .dev.vars.example .dev.vars   # add GEMINI_API_KEY
npm install
npx wrangler dev                 # http://localhost:8787
```

## Architecture

One Cloudflare Worker. 12 source files. ~58KB gzipped.

```
src/
  index.ts          # Worker entry: GET / + POST /api/chat + POST /api/crystal/decrypt
  gemini.ts         # Gemini 2.5 Flash, tool-call loop (up to 8 rounds)
  tools.ts          # 5 tools: air quality, area c, trees, demographics, build_crystal
  crystal.ts        # .mem builder + parser + decrypter (selective disclosure)
  crypto.ts         # Ed25519, X25519, HKDF-SHA256, XChaCha20-Poly1305
  cbor.ts           # DAG-CBOR via cborg
  viewer.ts         # Static HTML: chat + crystal viewer with role toggle
  data/
    air-quality.ts  # ARPA Lombardia Socrata (nicp-bhqi + ib47-atvt)
    area-c.ts       # Milan CKAN (2019+ and pre-2019 resources)
    trees.ts        # Milan CKAN (251K trees)
    demographics.ts # Milan CKAN (88 NILs, 2011-2023)
```

## Key files

- `src/crypto.ts` -- All crypto primitives. Follows WALLET_ARCHITECTURE.md Sections 1-2. Domain separation strings, HKDF derivation chains, stanza wrapping/unwrapping.
- `src/crystal.ts` -- The .mem format. `buildCrystal()` creates, `decryptCrystal()` reads. Demo keypairs (author/planner/researcher) derived from known seeds.
- `src/tools.ts` -- Where Gemini tool calls map to data fetches. `build_crystal` tool triggers crystal creation.
- `src/gemini.ts` -- System prompt defines agent behavior. Edit this to change how the agent reasons.
- `src/viewer.ts` -- The entire UI is one HTML string. Chat left, crystal viewer right.

## Data sources

| Dataset | API | Endpoint |
|---------|-----|----------|
| Air Quality | Socrata SODA | `dati.lombardia.it/resource/nicp-bhqi.json` (readings) + `ib47-atvt.json` (stations) |
| Area C | CKAN DataStore | resource `b25e13d8-7fcb-46e3-b1e9-ff81b18f5c84` (2019+) |
| Trees | CKAN DataStore | resource `604dd6bb-7ec8-4262-babb-1fa392f864cc` |
| Demographics | CKAN DataStore | resource `084457a7-ec4b-4a6b-b463-d8ab53c64fbb` |

All public, no auth required. ARPA is CC0, Milan datasets are CC-BY.

## Crypto

Deterministic encryption. No randomness. Same inputs -> same bytes -> same hash. Content addressing works for encrypted data.

- Frame keys: `HKDF(author_priv, "chainge/frame-key/v1" || label || sha256(plaintext))`
- Stanza wrapping: ephemeral X25519 DH, HKDF-derived wrapping key + nonce
- Frame encryption: XChaCha20-Poly1305 with HKDF-derived nonce
- Receipt signature: Ed25519 with domain separation

Demo keypairs are deterministic from known seeds (see `DEMO_KEYS` in crystal.ts). In production these come from the wallet key hierarchy.

## Deploy

```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```

## Docs

- `docs/BUILD_LOG.md` -- What was built, when, decisions made
- `docs/ARCHITECTURE.md` -- How the pieces fit together
- `docs/CRYSTAL_SPEC.md` -- .mem format subset implemented here

## What's next (hackathon remaining work)

- [x] Test with live Gemini API key
- [x] Tune system prompt after seeing real tool results (cross-dataset reasoning directives)
- [x] Add error handling for API timeouts / empty responses (tool try/catch, candidate guard)
- [x] Fix multi-tool query crash (candidate.content undefined)
- [x] Fix text accumulation across tool rounds
- [x] Viewer copy overhaul (accessible role descriptions, sealed messages, intro text)
- [ ] Crystal download/export button in viewer
- [ ] Cover image + submission materials
- [ ] Polish unlock animation (glass-shatter or frosted-glass clear effect)
- [ ] README demo screenshot
