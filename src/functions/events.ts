/**
 * Handles metadata change notifications across components and browser tabs.
 *
 * Responsibility:
 * - Broadcast metadata updates through window events and BroadcastChannel.
 * - Provide a unified subscribe/unsubscribe API for metadata refresh triggers.
 */
const METADATA_EVENT = "logits:metadata-changed";
const CHANNEL_NAME = "logits-metadata";

type MetadataChangePayload = {
  hash: string;
};

let channel: BroadcastChannel | null = null;

function getChannel() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!channel && "BroadcastChannel" in window) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }

  return channel;
}

export function emitMetadataChanged(payload: MetadataChangePayload) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<MetadataChangePayload>(METADATA_EVENT, {
    detail: payload,
  }));

  const activeChannel = getChannel();
  activeChannel?.postMessage(payload);
}

export function subscribeToMetadataChanges(
  callback: (payload: MetadataChangePayload) => void,
) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onWindowEvent = (event: Event) => {
    const customEvent = event as CustomEvent<MetadataChangePayload>;
    callback(customEvent.detail);
  };

  window.addEventListener(METADATA_EVENT, onWindowEvent);

  const activeChannel = getChannel();
  const onChannelMessage = (event: MessageEvent<MetadataChangePayload>) => {
    callback(event.data);
  };

  activeChannel?.addEventListener("message", onChannelMessage);

  return () => {
    window.removeEventListener(METADATA_EVENT, onWindowEvent);
    activeChannel?.removeEventListener("message", onChannelMessage);
  };
}
