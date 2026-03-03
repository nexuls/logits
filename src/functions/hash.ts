/**
 * Provides deterministic hashing utilities for change detection.
 *
 * Responsibility:
 * - Compute SHA-256 hashes for arbitrary serializable payloads.
 * - Fallback to a lightweight deterministic hash when Web Crypto is unavailable.
 */
const textEncoder = new TextEncoder();

function fallbackHash(input: string) {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }

  return `fallback-${Math.abs(hash)}`;
}

export async function sha256FromUnknown(value: unknown) {
  const serialized = JSON.stringify(value);

  if (!globalThis.crypto?.subtle) {
    return fallbackHash(serialized);
  }

  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(serialized),
  );

  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}
