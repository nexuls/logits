const DATA_STORE_CHANNEL_NAME = "logits:data-store";
const DATA_STORE_STORAGE_KEY = "logits:data-store:event";
const MAX_SEEN_MESSAGE_IDS = 512;

export type BroadcastDataStoreEvent =
	| { type: "structure-changed" }
	| { type: "settings-updated" }
	| { type: "file-content-updated"; notebookId: string; fileId: string };

type BroadcastEnvelopeBase = {
	messageId: string;
	sourceId: string;
	sentAt: number;
};

export type DataStoreBroadcastMessage =
	| (BroadcastEnvelopeBase & { type: "structure-changed" })
	| (BroadcastEnvelopeBase & { type: "settings-updated" })
	| (BroadcastEnvelopeBase & {
			type: "file-content-updated";
			notebookId: string;
			fileId: string;
		});

export type ServiceWorkerBroadcastMessage = BroadcastEnvelopeBase & {
	type: "service-worker-message";
	payload: unknown;
};

export type CrossTabMessage =
	| DataStoreBroadcastMessage
	| ServiceWorkerBroadcastMessage;

const tabSourceId = createSourceId();
const seenMessageIds = new Set<string>();

let dataStoreChannel: BroadcastChannel | null = null;
let localStorageSupported: boolean | null = null;

function createSourceId() {
	if (
		typeof globalThis !== "undefined" &&
		typeof globalThis.crypto?.randomUUID === "function"
	) {
		return globalThis.crypto.randomUUID();
	}

	return `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}

function getChannel() {
	if (typeof globalThis === "undefined") return null;
	if (typeof globalThis.BroadcastChannel !== "function") return null;

	if (!dataStoreChannel) {
		dataStoreChannel = new globalThis.BroadcastChannel(DATA_STORE_CHANNEL_NAME);
	}

	return dataStoreChannel;
}

function canUseLocalStorage() {
	if (localStorageSupported !== null) return localStorageSupported;
	if (typeof globalThis === "undefined") {
		localStorageSupported = false;
		return localStorageSupported;
	}

	try {
		localStorageSupported = typeof globalThis.localStorage !== "undefined";
	} catch {
		localStorageSupported = false;
	}

	return localStorageSupported;
}

function postMessageWithFallback(message: CrossTabMessage) {
	rememberMessage(message.messageId);

	const channel = getChannel();
	if (channel) {
		channel.postMessage(message);
		return;
	}

	if (!canUseLocalStorage()) return;

	const envelope = {
		nonce: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
		message,
	};

	try {
		globalThis.localStorage.setItem(
			DATA_STORE_STORAGE_KEY,
			JSON.stringify(envelope),
		);
	} catch {
		// Ignore storage write failures in restricted environments.
	}
}

function toEnvelopeBase(): BroadcastEnvelopeBase {
	return {
		messageId: createMessageId(),
		sourceId: tabSourceId,
		sentAt: Date.now(),
	};
}

function createMessageId() {
	return `${tabSourceId}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function rememberMessage(messageId: string) {
	seenMessageIds.add(messageId);

	if (seenMessageIds.size <= MAX_SEEN_MESSAGE_IDS) return;

	const overflowCount = seenMessageIds.size - MAX_SEEN_MESSAGE_IDS;
	for (let index = 0; index < overflowCount; index += 1) {
		const oldest = seenMessageIds.values().next();
		if (oldest.done) return;

		seenMessageIds.delete(oldest.value);
	}
}

function hasSeenMessage(messageId: string) {
	return seenMessageIds.has(messageId);
}

function toDataStoreBroadcastMessage(
	event: BroadcastDataStoreEvent,
): DataStoreBroadcastMessage {
	if (event.type === "file-content-updated") {
		return {
			...toEnvelopeBase(),
			type: "file-content-updated",
			notebookId: event.notebookId,
			fileId: event.fileId,
		};
	}

	return {
		...toEnvelopeBase(),
		type: event.type,
	};
}

function isBroadcastEnvelopeBase(value: unknown): value is BroadcastEnvelopeBase {
	if (!isObject(value)) return false;

	return (
		typeof value.messageId === "string" &&
		typeof value.sourceId === "string" &&
		typeof value.sentAt === "number" &&
		Number.isFinite(value.sentAt)
	);
}

function isDataStoreBroadcastMessage(
	value: unknown,
): value is DataStoreBroadcastMessage {
	if (!isBroadcastEnvelopeBase(value) || !isObject(value)) return false;

	const record = value as Record<string, unknown>;
	const type = record.type;

	if (type === "structure-changed") return true;
	if (type === "settings-updated") return true;

	return (
		type === "file-content-updated" &&
		typeof record.notebookId === "string" &&
		typeof record.fileId === "string"
	);
}

function isServiceWorkerBroadcastMessage(
	value: unknown,
): value is ServiceWorkerBroadcastMessage {
	if (!isBroadcastEnvelopeBase(value) || !isObject(value)) return false;

	const record = value as Record<string, unknown>;

	return (
		record.type === "service-worker-message"
	);
}

export function isCrossTabMessage(value: unknown): value is CrossTabMessage {
	return (
		isDataStoreBroadcastMessage(value) || isServiceWorkerBroadcastMessage(value)
	);
}

export function broadcastDataStoreEvent(event: BroadcastDataStoreEvent) {
	postMessageWithFallback(toDataStoreBroadcastMessage(event));
}

export function subscribeToDataStoreEvents(
	listener: (event: BroadcastDataStoreEvent) => void,
) {
	const handleMessage = (message: unknown) => {
		if (!isDataStoreBroadcastMessage(message)) return;
		if (message.sourceId === tabSourceId) return;
		if (hasSeenMessage(message.messageId)) return;

		rememberMessage(message.messageId);

		if (message.type === "file-content-updated") {
			listener({
				type: "file-content-updated",
				notebookId: message.notebookId,
				fileId: message.fileId,
			});
			return;
		}

		listener({ type: message.type });
	};

	const channel = getChannel();
	const releaseCallbacks: Array<() => void> = [];

	if (channel) {
		const onChannelMessage = (event: MessageEvent<unknown>) => {
			handleMessage(event.data);
		};

		channel.addEventListener("message", onChannelMessage);
		releaseCallbacks.push(() => {
			channel.removeEventListener("message", onChannelMessage);
		});
	}

	if (canUseLocalStorage() && typeof globalThis.addEventListener === "function") {
		const onStorage = (event: StorageEvent) => {
			if (event.key !== DATA_STORE_STORAGE_KEY) return;
			if (!event.newValue) return;
			if (event.storageArea !== globalThis.localStorage) return;

			try {
				const parsed = JSON.parse(event.newValue) as {
					message?: unknown;
				};

				handleMessage(parsed.message);
			} catch {
				// Ignore malformed payloads.
			}
		};

		globalThis.addEventListener("storage", onStorage);
		releaseCallbacks.push(() => {
			globalThis.removeEventListener("storage", onStorage);
		});
	}

	if (releaseCallbacks.length === 0) return () => {};

	return () => {
		for (const release of releaseCallbacks) {
			release();
		}
	};
}

export function broadcastServiceWorkerMessage(payload: unknown) {
	postMessageWithFallback({
		...toEnvelopeBase(),
		type: "service-worker-message",
		payload,
	} satisfies ServiceWorkerBroadcastMessage);
}

export function bindServiceWorkerToBroadcast() {
	if (typeof globalThis === "undefined") return () => {};
	if (!("navigator" in globalThis)) return () => {};

	const { serviceWorker } = globalThis.navigator;
	if (!serviceWorker) return () => {};

	const onServiceWorkerMessage = (event: MessageEvent<unknown>) => {
		broadcastServiceWorkerMessage(event.data);
	};

	serviceWorker.addEventListener("message", onServiceWorkerMessage);

	return () => {
		serviceWorker.removeEventListener("message", onServiceWorkerMessage);
	};
}
