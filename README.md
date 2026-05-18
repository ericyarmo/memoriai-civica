# memoria civica

A climate intelligence agent for Milan that packages findings into memory crystals with selective disclosure.

Ask the agent a question about Milan's climate, traffic, trees, or demographics. It queries live public datasets, reasons across them, and forges a **memory crystal** -- a single portable file where different keys unlock different content. No server decides who sees what. The math does.

---

## What it does

1. **Agent queries live Milan data** -- air quality sensors, Area C congestion entries, 251K urban trees, demographics across 88 neighborhoods
2. **Agent reasons across datasets** -- cross-referencing pollution with traffic, tree density with population, policy impact over time
3. **Agent forges a crystal** -- a ~1KB `.mem` binary with 3 frames:
   - **Public** -- headline findings anyone can see
   - **Planner** -- sensor-level data and policy metrics for city officials
   - **Researcher** -- raw statistics with demographic overlay for academics
4. **Viewer shows selective disclosure** -- toggle between roles. Same file, same bytes, same hash. Different keys, different content.

## Data sources

| Dataset | Source | API | Coverage |
|---------|--------|-----|----------|
| Air Quality | ARPA Lombardia | Socrata SODA | Hourly PM10/PM2.5/NO2/O3, all Milan stations |
| Area C Congestion | Comune di Milano | CKAN DataStore | Daily vehicle entries, 2012-present |
| Urban Trees | Comune di Milano | CKAN DataStore | 251K+ georeferenced trees, species/dimensions |
| Demographics | Comune di Milano | CKAN DataStore | 88 NILs, population/migration/elderly, 2011-2023 |

## The crystal

The `.mem` format implements selective disclosure via per-frame encryption:

- **Magic bytes**: `MEM\x01` (4 bytes)
- **Header**: CBOR-encoded version + frame count
- **Frame table**: Array of frames, each with a label, stanzas (wrapped keys), and body (encrypted or plaintext)
- **Receipt envelope**: Ed25519 signature, content-addressed via SHA-256

Crypto: Ed25519 signing, X25519 key exchange, HKDF-SHA256 derivation, XChaCha20-Poly1305 encryption. All deterministic -- same inputs produce the same bytes, the same hash. Content addressing works for encrypted data.

Frame keys are derived from the author's encryption key, the frame label, and a hash of the plaintext. Stanzas wrap each frame key for specific recipients via ephemeral X25519 Diffie-Hellman. A recipient uses their private key to unwrap the stanza, recover the frame key, and decrypt the content.

Built on [@noble](https://github.com/paulmillr/noble-curves) cryptographic libraries (audited, pure JavaScript).

## Run locally

```bash
git clone https://github.com/ericyarmo/memoriai-civica.git
cd memoriai-civica
npm install
cp .dev.vars.example .dev.vars   # add your Gemini API key
npx wrangler dev                 # http://localhost:8787
```

## Deploy

```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```

## Architecture

```
src/
  index.ts          # Worker entry: GET / (viewer) + POST /api/chat + POST /api/crystal/decrypt
  gemini.ts         # Gemini 2.5 Flash client, tool-call loop, system prompt
  tools.ts          # 5 tools: air quality, area c, trees, demographics, build_crystal
  crystal.ts        # .mem builder: frames, stanzas, receipt signing, parsing, decryption
  crypto.ts         # Ed25519 + X25519 + HKDF + XChaCha20-Poly1305
  cbor.ts           # DAG-CBOR encoding via cborg
  viewer.ts         # Static HTML: chat + crystal viewer with role toggle + unlock animation
  data/
    air-quality.ts  # ARPA Lombardia Socrata queries (nicp-bhqi + ib47-atvt station join)
    area-c.ts       # Milan CKAN queries (daily congestion entries)
    trees.ts        # Milan CKAN queries (251K tree inventory)
    demographics.ts # Milan CKAN queries (88 NILs, 2011-2023)
```

One Cloudflare Worker. One deployment. 12 source files. ~58KB gzipped.

## Context

This project demonstrates the `.mem` crystal format -- a portable, encrypted, selectively disclosable wrapper for multimodal content. The format is part of a larger civic memory infrastructure called [ChaingeOS](https://github.com/ericyarmo).

The climate agent is the vehicle. The crystal is the product.

## License

MIT
