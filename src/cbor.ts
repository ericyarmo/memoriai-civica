// DAG-CBOR encoding via cborg. Deterministic, canonical, sorted keys.

import { encode, decode } from 'cborg';

export function cborEncode(value: unknown): Uint8Array {
  return encode(value);
}

export function cborDecode<T = unknown>(bytes: Uint8Array): T {
  return decode(bytes) as T;
}
