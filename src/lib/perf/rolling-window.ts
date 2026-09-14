/**
 * A fixed-capacity window over the most recent samples — frame times, input
 * latencies, a metric's history for a sparkline.
 *
 * Backed by typed arrays allocated once, because the performance monitor
 * pushes into these on every animation frame and a monitor that allocates per
 * frame would show its own garbage collection as jank.
 */
export class RollingWindow {
  private readonly values: Float64Array;
  /** Sorted copy for `percentile`, kept so a read does not allocate either. */
  private readonly scratch: Float64Array;
  private start = 0;
  private length = 0;

  constructor(capacity: number) {
    const size = Math.max(1, Math.trunc(capacity));
    this.values = new Float64Array(size);
    this.scratch = new Float64Array(size);
  }

  get capacity(): number {
    return this.values.length;
  }

  get size(): number {
    return this.length;
  }

  /** Adds a sample, dropping the oldest once the window is full. */
  push(value: number): void {
    const capacity = this.values.length;
    if (this.length < capacity) {
      this.values[(this.start + this.length) % capacity] = value;
      this.length++;
      return;
    }
    this.values[this.start] = value;
    this.start = (this.start + 1) % capacity;
  }

  clear(): void {
    this.start = 0;
    this.length = 0;
  }

  /** The newest sample, or `NaN` when empty. */
  latest(): number {
    if (this.length === 0) return Number.NaN;
    return this.at(this.length - 1);
  }

  sum(): number {
    let total = 0;
    for (let i = 0; i < this.length; i++) total += this.at(i);
    return total;
  }

  /** `NaN` when empty — "no data" and "zero" are different answers. */
  mean(): number {
    return this.length === 0 ? Number.NaN : this.sum() / this.length;
  }

  min(): number {
    if (this.length === 0) return Number.NaN;
    let lowest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.length; i++) lowest = Math.min(lowest, this.at(i));
    return lowest;
  }

  max(): number {
    if (this.length === 0) return Number.NaN;
    let highest = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < this.length; i++) {
      highest = Math.max(highest, this.at(i));
    }
    return highest;
  }

  /**
   * Nearest-rank percentile, `p` in `[0, 100]`. Nearest-rank rather than
   * interpolated so the answer is always a sample that happened: a p95 frame
   * time of 17.3 ms should be a frame that took 17.3 ms.
   */
  percentile(p: number): number {
    if (this.length === 0) return Number.NaN;
    const sorted = this.scratch.subarray(0, this.length);
    for (let i = 0; i < this.length; i++) sorted[i] = this.at(i);
    sorted.sort();

    const clamped = Math.min(100, Math.max(0, p));
    const rank = Math.ceil((clamped / 100) * this.length);
    return sorted[Math.max(0, rank - 1)];
  }

  /** How many samples are strictly above `threshold`. */
  countAbove(threshold: number): number {
    let count = 0;
    for (let i = 0; i < this.length; i++) {
      if (this.at(i) > threshold) count++;
    }
    return count;
  }

  /** Oldest first. Allocates — for publishing a snapshot, not the frame loop. */
  toArray(): number[] {
    const out = new Array<number>(this.length);
    for (let i = 0; i < this.length; i++) out[i] = this.at(i);
    return out;
  }

  private at(offset: number): number {
    return this.values[(this.start + offset) % this.values.length];
  }
}
