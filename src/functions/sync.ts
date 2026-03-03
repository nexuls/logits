/**
 * Coordinates local metadata synchronization lifecycle.
 *
 * Responsibility:
 * - Reconcile mutation queue and metadata hash state.
 * - Start sync triggers (startup, focus, online, and polling intervals).
 * - Notify consumers when fresh metadata should be re-hydrated.
 */
import { subscribeToMetadataChanges } from "./events";
import {
  flushMutationQueue,
  getStoredMetadataHash,
  getMetadataSnapshot,
  setMetadataSnapshot,
} from "./repositories";
import { sha256FromUnknown } from "./hash";

type SyncCallback = () => void;

type StartSyncOptions = {
  onSynced?: SyncCallback;
  pollIntervalMs?: number;
};

export async function syncMetadataHash() {
  const snapshot = await getMetadataSnapshot();

  if (!snapshot) {
    return { changed: false, hash: "" };
  }

  const currentHash = await sha256FromUnknown(snapshot.projects);
  const storedHash = await getStoredMetadataHash();

  if (storedHash === currentHash) {
    return {
      changed: false,
      hash: currentHash,
    };
  }

  const { hash } = await setMetadataSnapshot(snapshot);

  return {
    changed: currentHash !== hash,
    hash,
  };
}

export function startLocalSync(options: StartSyncOptions = {}) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const pollIntervalMs = options.pollIntervalMs ?? 60_000;

  const runSync = async () => {
    await flushMutationQueue();
    await syncMetadataHash();
    options.onSynced?.();
  };

  const onFocus = () => {
    void runSync();
  };

  const onOnline = () => {
    void runSync();
  };

  const intervalId = window.setInterval(() => {
    void runSync();
  }, pollIntervalMs);

  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onOnline);

  const unsubscribe = subscribeToMetadataChanges(() => {
    options.onSynced?.();
  });

  void runSync();

  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("online", onOnline);
    unsubscribe();
  };
}
