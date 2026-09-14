import { describe, expect, it } from "vitest";
import { RollingWindow } from "./rolling-window";

function windowOf(capacity: number, values: number[]): RollingWindow {
  const window = new RollingWindow(capacity);
  for (const value of values) window.push(value);
  return window;
}

describe("RollingWindow", () => {
  it("answers NaN rather than zero when it has no samples", () => {
    const empty = new RollingWindow(4);
    expect(empty.size).toBe(0);
    expect(empty.mean()).toBeNaN();
    expect(empty.min()).toBeNaN();
    expect(empty.max()).toBeNaN();
    expect(empty.latest()).toBeNaN();
    expect(empty.percentile(50)).toBeNaN();
    expect(empty.sum()).toBe(0);
  });

  it("keeps samples oldest first until it fills", () => {
    const window = windowOf(4, [1, 2, 3]);
    expect(window.toArray()).toEqual([1, 2, 3]);
    expect(window.latest()).toBe(3);
  });

  it("drops the oldest sample once full", () => {
    const window = windowOf(3, [1, 2, 3, 4, 5]);
    expect(window.size).toBe(3);
    expect(window.toArray()).toEqual([3, 4, 5]);
    expect(window.sum()).toBe(12);
    expect(window.mean()).toBe(4);
    expect(window.min()).toBe(3);
    expect(window.max()).toBe(5);
  });

  it("takes nearest-rank percentiles, so the answer is a real sample", () => {
    const window = windowOf(10, [10, 1, 9, 2, 8, 3, 7, 4, 6, 5]);
    expect(window.percentile(0)).toBe(1);
    expect(window.percentile(50)).toBe(5);
    expect(window.percentile(95)).toBe(10);
    expect(window.percentile(100)).toBe(10);
  });

  it("sorts numerically, not as strings", () => {
    const window = windowOf(3, [100, 20, 3]);
    expect(window.percentile(50)).toBe(20);
  });

  it("does not disturb the sample order when taking a percentile", () => {
    const window = windowOf(4, [4, 3, 2, 1]);
    window.percentile(50);
    expect(window.toArray()).toEqual([4, 3, 2, 1]);
  });

  it("counts samples above a threshold", () => {
    const window = windowOf(5, [16, 17, 33, 50, 16]);
    expect(window.countAbove(25)).toBe(2);
  });

  it("starts over when cleared", () => {
    const window = windowOf(3, [1, 2, 3, 4]);
    window.clear();
    expect(window.size).toBe(0);
    window.push(9);
    expect(window.toArray()).toEqual([9]);
  });
});
