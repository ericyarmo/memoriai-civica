// Crypto primitives: Ed25519, X25519, HKDF-SHA256, XChaCha20-Poly1305.
// Clean-room for MIT license. Follows WALLET_ARCHITECTURE.md Sections 1-2.

import { ed25519, x25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2';
import { hkdf } from '@noble/hashes/hkdf';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { concatBytes } from '@noble/hashes/utils';

// Domain separation strings (per ChaingeOS spec)
const SIGN_DOMAIN = utf8('chainge/receipt-sig/v1');
const ID_DOMAIN = utf8('chainge/receipt-id/v1');
const FRAME_KEY_INFO = utf8('chainge/frame-key/v1');
const EPH_INFO = utf8('chainge/eph/v1');
const WRAP_INFO = utf8('chainge/wrap/v1');
const SIGN_DERIVE_INFO = utf8('chainge/sign/ed25519/v1');
const ENCRYPT_DERIVE_INFO = utf8('chainge/encrypt/x25519/v1');

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// --- Key derivation from seed (WALLET_ARCHITECTURE.md Section 3) ---

export function deriveSigningKey(seed: Uint8Array): Uint8Array {
  return hkdf(sha256, seed, undefined, SIGN_DERIVE_INFO, 32);
}

export function deriveEncryptKey(seed: Uint8Array): Uint8Array {
  return hkdf(sha256, seed, undefined, ENCRYPT_DERIVE_INFO, 32);
}

// --- Ed25519 signing ---

export function getSigningPub(priv: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(priv);
}

export function sign(content: Uint8Array, priv: Uint8Array): Uint8Array {
  return ed25519.sign(concatBytes(SIGN_DOMAIN, content), priv);
}

export function verify(sig: Uint8Array, content: Uint8Array, pub: Uint8Array): boolean {
  return ed25519.verify(sig, concatBytes(SIGN_DOMAIN, content), pub);
}

// --- X25519 ---

export function getEncryptPub(priv: Uint8Array): Uint8Array {
  return x25519.getPublicKey(priv);
}

function dh(myPriv: Uint8Array, theirPub: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(myPriv, theirPub);
}

// --- Receipt ID ---

export function receiptId(receiptBytes: Uint8Array): Uint8Array {
  return sha256(concatBytes(ID_DOMAIN, receiptBytes));
}

// --- Frame key derivation (Section 2) ---

export function deriveFrameKey(
  authorEncryptPriv: Uint8Array,
  label: string,
  plaintext: Uint8Array,
): Uint8Array {
  const info = concatBytes(FRAME_KEY_INFO, utf8(label), sha256(plaintext));
  return hkdf(sha256, authorEncryptPriv, undefined, info, 32);
}

// --- Frame body encryption ---

function frameBodyNonce(frameKey: Uint8Array, label: string): Uint8Array {
  return hkdf(sha256, frameKey, undefined, utf8(label + '/body-nonce'), 24);
}

export function encryptFrame(
  frameKey: Uint8Array,
  label: string,
  plaintext: Uint8Array,
): Uint8Array {
  const nonce = frameBodyNonce(frameKey, label);
  return xchacha20poly1305(frameKey, nonce).encrypt(plaintext);
}

export function decryptFrame(
  frameKey: Uint8Array,
  label: string,
  ciphertext: Uint8Array,
): Uint8Array {
  const nonce = frameBodyNonce(frameKey, label);
  return xchacha20poly1305(frameKey, nonce).decrypt(ciphertext);
}

// --- Stanza wrapping (Section 2) ---

export interface Stanza {
  type: string;
  recipientTag: Uint8Array; // first 4 bytes of SHA-256(recipient pub)
  ephemeralPub: Uint8Array; // 32 bytes
  body: Uint8Array; // 48 bytes (32 key + 16 auth tag)
}

export function wrapFrameKey(
  frameKey: Uint8Array,
  recipientPub: Uint8Array,
  label: string,
): Stanza {
  // 1. Deterministic ephemeral keypair
  const ephPriv = hkdf(sha256, frameKey, undefined, concatBytes(EPH_INFO, recipientPub), 32);
  const ephPub = x25519.getPublicKey(ephPriv);

  // 2. DH shared secret
  const shared = dh(ephPriv, recipientPub);

  // 3. Wrapping key
  const wrapKey = hkdf(sha256, shared, undefined, WRAP_INFO, 32);

  // 4. Nonce
  const nonce = hkdf(sha256, shared, undefined, utf8(label + '/nonce'), 24);

  // 5. Wrap
  const body = xchacha20poly1305(wrapKey, nonce).encrypt(frameKey);

  // Recipient tag
  const tag = sha256(recipientPub).slice(0, 4);

  return { type: 'X25519', recipientTag: tag, ephemeralPub: ephPub, body };
}

export function unwrapFrameKey(
  recipientPriv: Uint8Array,
  stanza: Stanza,
  label: string,
): Uint8Array {
  const shared = dh(recipientPriv, stanza.ephemeralPub);
  const wrapKey = hkdf(sha256, shared, undefined, WRAP_INFO, 32);
  const nonce = hkdf(sha256, shared, undefined, utf8(label + '/nonce'), 24);
  return xchacha20poly1305(wrapKey, nonce).decrypt(stanza.body);
}

// --- Utilities ---

export function findStanza(stanzas: Stanza[], recipientPub: Uint8Array): Stanza | null {
  const tag = sha256(recipientPub).slice(0, 4);
  return stanzas.find(s =>
    s.recipientTag[0] === tag[0] &&
    s.recipientTag[1] === tag[1] &&
    s.recipientTag[2] === tag[2] &&
    s.recipientTag[3] === tag[3]
  ) || null;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export { sha256, concatBytes };
