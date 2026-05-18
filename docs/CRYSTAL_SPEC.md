# Crystal Spec (Hackathon Subset)

This documents the subset of the `.mem` crystal format implemented in this repo. The full specification lives in [WALLET_ARCHITECTURE.md](https://github.com/ericyarmo) and covers key hierarchies, social recovery, disclosure receipts, federation, and post-quantum migration. This implementation is the minimum viable proof of selective disclosure.

---

## What a crystal is

A crystal is a receipt where the payload is a `.mem` wrapper. The receipt provides authorship and integrity (Ed25519 signature, content address). The `.mem` wrapper adds multi-frame encryption: different audiences see different content from the same bytes.

## Binary format

```
Offset   Size      Content
0        4         Magic: 0x4D 0x45 0x4D 0x01 ("MEM" + version 1)
4        2         Header length (uint16 big-endian)
6        variable  Header (CBOR-encoded)
6+H      variable  Frame table (CBOR-encoded)
```

### Header

```cbor
{
  "v": "chainge/mem/v1",
  "frameCount": <uint>
}
```

### Frame table

```cbor
[
  {
    "label": <text>,
    "stanzas": [<Stanza>, ...],
    "body": <bytes>
  },
  ...
]
```

### Stanza

```cbor
{
  "type": "X25519",
  "recipientTag": <bytes(4)>,
  "ephemeralPub": <bytes(32)>,
  "body": <bytes(48)>
}
```

- `recipientTag`: first 4 bytes of SHA-256(recipient X25519 public key)
- `ephemeralPub`: sender's ephemeral X25519 public key (deterministic)
- `body`: wrapped frame key (32 bytes) + Poly1305 auth tag (16 bytes)

Public frames have an empty stanzas array and a plaintext body.

## Crypto operations

### Frame key derivation

```
frame_key = HKDF-SHA256(
  ikm:  author_x25519_private_key,
  salt: nil,
  info: "chainge/frame-key/v1" || frame_label || SHA-256(plaintext),
  len:  32
)
```

### Frame body encryption

```
nonce = HKDF-SHA256(frame_key, nil, frame_label || "/body-nonce", 24)
ciphertext = XChaCha20-Poly1305(frame_key, nonce).encrypt(plaintext)
```

### Stanza wrapping (wrap frame key for one recipient)

```
1. eph_priv = HKDF(frame_key, nil, "chainge/eph/v1" || recipient_pub, 32)
   eph_pub  = X25519_base(eph_priv)
2. shared   = X25519(eph_priv, recipient_pub)
3. wrap_key = HKDF(shared, nil, "chainge/wrap/v1", 32)
4. nonce    = HKDF(shared, nil, frame_label || "/nonce", 24)
5. body     = XChaCha20-Poly1305(wrap_key, nonce).encrypt(frame_key)
```

### Stanza unwrapping (recipient decrypts)

```
1. shared   = X25519(recipient_priv, stanza.ephemeralPub)
2. wrap_key = HKDF(shared, nil, "chainge/wrap/v1", 32)
3. nonce    = HKDF(shared, nil, frame_label || "/nonce", 24)
4. frame_key = XChaCha20-Poly1305(wrap_key, nonce).decrypt(stanza.body)
```

### Receipt envelope

```
content = CBOR({ refs, author, schema: "chainge/mem/v1", payload: mem_bytes })
signature = Ed25519_sign("chainge/receipt-sig/v1" || content, author_signing_priv)
receipt = CBOR({ refs, author, schema, payload: mem_bytes, signature })
receipt_id = SHA-256("chainge/receipt-id/v1" || receipt_bytes)
```

## Deterministic encryption

No randomness anywhere. Every key, nonce, and ephemeral value is derived via HKDF from the author's private key and deterministic context strings. Same inputs always produce the same ciphertext, the same `.mem` bytes, the same receipt ID.

This is the property that enables content addressing for encrypted data.

## What this implementation covers

| Feature | Implemented | Full spec |
|---------|-------------|-----------|
| .mem binary format | Yes | Yes |
| Frame encryption (XChaCha20-Poly1305) | Yes | Yes |
| Stanza wrapping (X25519 + HKDF) | Yes | Yes |
| Stanza unwrapping | Yes | Yes |
| Deterministic encryption | Yes | Yes |
| Receipt envelope + signature | Yes | Yes |
| Content addressing (receipt ID) | Yes | Yes |
| Multiple recipients per frame | 1 per frame | N per frame |
| Key hierarchy (root/device/context) | Demo seeds only | Full HKDF tree |
| Attestation chain | No | Yes |
| Disclosure receipts | No | Yes |
| Social recovery (Shamir SSS) | No | Yes |
| Backup stanzas | No | Yes |
| ML-KEM-768 stanzas | No | Roadmap |

## Byte budget (this implementation)

| Component | Size |
|-----------|------|
| Magic + header length | 6 bytes |
| Header CBOR | ~34 bytes |
| Per public frame shell | ~45 bytes + content |
| Per encrypted frame shell | ~45 bytes + stanza (133 bytes) + ciphertext |
| Receipt envelope overhead | ~161 bytes |

A typical 3-frame crystal with moderate content: 800-1500 bytes.
