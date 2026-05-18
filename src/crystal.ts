// Crystal builder: .mem wrapper per WALLET_ARCHITECTURE.md Section 1.
// Builds and parses the MEM binary format with multi-frame selective disclosure.

import { cborEncode, cborDecode } from './cbor';
import {
  deriveFrameKey, encryptFrame, decryptFrame,
  wrapFrameKey, unwrapFrameKey, findStanza,
  sign, getSigningPub, getEncryptPub, receiptId,
  deriveSigningKey, deriveEncryptKey,
  toHex, concatBytes,
  type Stanza,
} from './crypto';
import { sha256 } from '@noble/hashes/sha2';
import { hkdf } from '@noble/hashes/hkdf';

const MEM_MAGIC = new Uint8Array([0x4d, 0x45, 0x4d, 0x01]);
const MEM_VERSION = 'chainge/mem/v1';
const RECEIPT_SCHEMA = 'chainge/mem/v1';

// --- Demo keypairs (deterministic from known seeds) ---

const AUTHOR_SEED = sha256(new TextEncoder().encode('memoriai-civica/author/v1'));
const PLANNER_SEED = sha256(new TextEncoder().encode('memoriai-civica/planner/v1'));
const RESEARCHER_SEED = sha256(new TextEncoder().encode('memoriai-civica/researcher/v1'));

export const DEMO_KEYS = {
  author: {
    signPriv: deriveSigningKey(AUTHOR_SEED),
    signPub: getSigningPub(deriveSigningKey(AUTHOR_SEED)),
    encryptPriv: deriveEncryptKey(AUTHOR_SEED),
    encryptPub: getEncryptPub(deriveEncryptKey(AUTHOR_SEED)),
  },
  planner: {
    encryptPriv: deriveEncryptKey(PLANNER_SEED),
    encryptPub: getEncryptPub(deriveEncryptKey(PLANNER_SEED)),
  },
  researcher: {
    encryptPriv: deriveEncryptKey(RESEARCHER_SEED),
    encryptPub: getEncryptPub(deriveEncryptKey(RESEARCHER_SEED)),
  },
};

// --- Types ---

export interface FrameInput {
  label: string;
  content: Record<string, unknown>;
  isPublic: boolean;
}

export interface CrystalResult {
  receiptId: string;       // hex
  memSize: number;
  receiptSize: number;
  frames: Array<{ label: string; isPublic: boolean }>;
  memBytesB64: string;     // base64-encoded .mem bytes
  receiptBytesB64: string; // base64-encoded receipt bytes
}

interface EncodedFrame {
  label: string;
  stanzas: Stanza[];
  body: Uint8Array;
}

// --- Build crystal ---

export function buildCrystal(frames: FrameInput[]): CrystalResult {
  const { author, planner, researcher } = DEMO_KEYS;

  const encodedFrames: EncodedFrame[] = frames.map(frame => {
    const plaintext = cborEncode(frame.content);

    if (frame.isPublic) {
      return { label: frame.label, stanzas: [], body: plaintext };
    }

    // Derive frame key from author's encryption key
    const frameKey = deriveFrameKey(author.encryptPriv, frame.label, plaintext);

    // Encrypt body
    const encrypted = encryptFrame(frameKey, frame.label, plaintext);

    // Wrap frame key for recipients based on label
    const recipients = frame.label === 'planner'
      ? [planner.encryptPub]
      : frame.label === 'researcher'
        ? [researcher.encryptPub]
        : [planner.encryptPub, researcher.encryptPub];

    const stanzas = recipients.map(pub => wrapFrameKey(frameKey, pub, frame.label));

    return { label: frame.label, stanzas, body: encrypted };
  });

  // Build .mem binary
  const header = cborEncode({ v: MEM_VERSION, frameCount: frames.length });
  const headerLen = new Uint8Array(2);
  new DataView(headerLen.buffer).setUint16(0, header.length);
  const frameTable = cborEncode(encodedFrames);
  const memBytes = concatBytes(MEM_MAGIC, headerLen, header, frameTable);

  // Build receipt envelope
  const content = cborEncode({
    refs: [],
    author: author.signPub,
    schema: RECEIPT_SCHEMA,
    payload: memBytes,
  });
  const sig = sign(content, author.signPriv);
  const receiptBytes = cborEncode({
    refs: [],
    author: author.signPub,
    schema: RECEIPT_SCHEMA,
    payload: memBytes,
    signature: sig,
  });
  const id = receiptId(receiptBytes);

  return {
    receiptId: toHex(id),
    memSize: memBytes.length,
    receiptSize: receiptBytes.length,
    frames: frames.map(f => ({ label: f.label, isPublic: f.isPublic })),
    memBytesB64: bytesToBase64(memBytes),
    receiptBytesB64: bytesToBase64(receiptBytes),
  };
}

// --- Decrypt frames for a given role ---

export type Role = 'public' | 'planner' | 'researcher';

export interface DecryptedFrame {
  label: string;
  status: 'viewable' | 'sealed';
  content?: Record<string, unknown>;
}

export function decryptCrystal(memBytesB64: string, role: Role): DecryptedFrame[] {
  const memBytes = base64ToBytes(memBytesB64);
  const parsed = parseMem(memBytes);

  // Get the private key for this role
  const encryptPriv = role === 'planner'
    ? DEMO_KEYS.planner.encryptPriv
    : role === 'researcher'
      ? DEMO_KEYS.researcher.encryptPriv
      : null;

  const encryptPub = role === 'planner'
    ? DEMO_KEYS.planner.encryptPub
    : role === 'researcher'
      ? DEMO_KEYS.researcher.encryptPub
      : null;

  return parsed.frames.map(frame => {
    // Public frames are always viewable
    if (frame.stanzas.length === 0) {
      try {
        const content = cborDecode<Record<string, unknown>>(frame.body);
        return { label: frame.label, status: 'viewable' as const, content };
      } catch {
        return { label: frame.label, status: 'viewable' as const, content: {} };
      }
    }

    // For encrypted frames, try to find a matching stanza
    if (!encryptPriv || !encryptPub) {
      return { label: frame.label, status: 'sealed' as const };
    }

    const stanza = findStanza(frame.stanzas, encryptPub);
    if (!stanza) {
      return { label: frame.label, status: 'sealed' as const };
    }

    try {
      const frameKey = unwrapFrameKey(encryptPriv, stanza, frame.label);
      const plaintext = decryptFrame(frameKey, frame.label, frame.body);
      const content = cborDecode<Record<string, unknown>>(plaintext);
      return { label: frame.label, status: 'viewable' as const, content };
    } catch {
      return { label: frame.label, status: 'sealed' as const };
    }
  });
}

// --- Parse .mem binary ---

function parseMem(memBytes: Uint8Array): { version: string; frameCount: number; frames: EncodedFrame[] } {
  if (
    memBytes[0] !== 0x4d || memBytes[1] !== 0x45 ||
    memBytes[2] !== 0x4d || memBytes[3] !== 0x01
  ) {
    throw new Error('Invalid .mem magic bytes');
  }

  const headerLen = new DataView(
    memBytes.buffer, memBytes.byteOffset + 4, 2
  ).getUint16(0);

  const header = cborDecode<{ v: string; frameCount: number }>(
    memBytes.slice(6, 6 + headerLen)
  );

  const frames = cborDecode<EncodedFrame[]>(memBytes.slice(6 + headerLen));

  return { version: header.v, frameCount: header.frameCount, frames };
}

// --- Base64 helpers ---

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
