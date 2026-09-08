import { formatSignal, type Signal } from "./logic";

/**
 * The recorder behind `EvalContext.emitSample` and `scope.logic`.
 *
 * A fixed ring per channel, so a circuit left running for an hour costs the
 * same as one that has just started. Samples are held as the formatted string
 * rather than a `Signal`: it is what the view draws and what a snapshot
 * comparison needs, and a fresh `Uint8Array` per sample would be garbage the
 * engine's hot path cannot afford.
 *
 * It lives in `src/lib/sim/` and stays free of React, like everything else
 * here — the scope view reads it through the simulation store.
 */

export type WaveformSample = {
  /** Simulated nanoseconds. */
  time: number;
  /** MSB first, the way `formatSignal` writes a value. */
  value: string;
};

/** Samples kept per channel. Roughly a screenful at any sane time span. */
export const CHANNEL_CAPACITY = 2048;

class Ring {
  private readonly samples: WaveformSample[] = [];
  private start = 0;

  push(sample: WaveformSample): void {
    if (this.samples.length < CHANNEL_CAPACITY) {
      this.samples.push(sample);
      return;
    }
    this.samples[this.start] = sample;
    this.start = (this.start + 1) % CHANNEL_CAPACITY;
  }

  get last(): WaveformSample | undefined {
    const count = this.samples.length;
    if (count === 0) return undefined;
    return this.samples[(this.start + count - 1) % count];
  }

  /** Oldest first. Copied, so a caller cannot see the ring wrap under it. */
  read(): WaveformSample[] {
    const count = this.samples.length;
    const out: WaveformSample[] = new Array(count);
    for (let i = 0; i < count; i++) {
      out[i] = this.samples[(this.start + i) % count];
    }
    return out;
  }
}

/** One ring per node and channel, keyed by the pair. */
function channelKey(nodeId: string, channel: string): string {
  return `${nodeId} ${channel}`;
}

export class WaveformRecorder {
  private readonly channels = new Map<string, Ring>();

  record(nodeId: string, channel: string, time: number, value: Signal): void {
    const key = channelKey(nodeId, channel);
    let ring = this.channels.get(key);
    if (!ring) {
      ring = new Ring();
      this.channels.set(key, ring);
    }

    const text = formatSignal(value);
    const last = ring.last;
    // Only transitions are stored. A scope draws a level that holds until the
    // next change, so recording every re-evaluation would fill the ring with
    // duplicates and shorten the visible history for no gain.
    if (last && last.value === text) return;
    if (last && last.time === time) {
      // Two values at one instant: the later one is what the net settled on.
      last.value = text;
      return;
    }

    ring.push({ time, value: text });
  }

  read(nodeId: string, channel: string): WaveformSample[] {
    return this.channels.get(channelKey(nodeId, channel))?.read() ?? [];
  }

  clear(): void {
    this.channels.clear();
  }
}
