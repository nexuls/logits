/**
 * Opaque, collision-resistant ids for document elements.
 *
 * Deliberately not counters: two documents merged by paste or import would
 * hand out the same "node-3" twice. 12 chars of a 64-symbol alphabet is 72
 * bits, which is far beyond what a single document can exhaust.
 */

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const ID_LENGTH = 12;

function randomSuffix(): string {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  // The alphabet is exactly 64 symbols, so masking to 6 bits stays uniform.
  for (const byte of bytes) out += ALPHABET[byte & 63];
  return out;
}

/** Prefixes are cosmetic — ids stay opaque; nothing may parse them. */
export const createDocumentId = () => `d_${randomSuffix()}`;
export const createNodeId = () => `n_${randomSuffix()}`;
export const createWireId = () => `w_${randomSuffix()}`;
