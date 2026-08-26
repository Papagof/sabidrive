import { describe, expect, it } from "vitest";
import { enqueueLocationFix, type QueuedLocationFix } from "./location-queue";

function makeFix(recordedAt: string): QueuedLocationFix {
  return { lat: 0, lng: 0, headingDeg: null, speedKmh: null, deviationM: null, stopEtas: [], recordedAt };
}

describe("enqueueLocationFix", () => {
  it("appends to an empty queue", () => {
    const result = enqueueLocationFix([], makeFix("t1"), 100);
    expect(result.map((f) => f.recordedAt)).toEqual(["t1"]);
  });

  it("appends to a non-empty queue without exceeding the cap", () => {
    const queue = [makeFix("t1"), makeFix("t2")];
    const result = enqueueLocationFix(queue, makeFix("t3"), 100);
    expect(result.map((f) => f.recordedAt)).toEqual(["t1", "t2", "t3"]);
  });

  it("evicts the oldest entries when exceeding the cap, keeping the most recent", () => {
    const queue = [makeFix("t1"), makeFix("t2"), makeFix("t3")];
    const result = enqueueLocationFix(queue, makeFix("t4"), 3);
    expect(result.map((f) => f.recordedAt)).toEqual(["t2", "t3", "t4"]);
  });

  it("does not mutate the input queue", () => {
    const queue = [makeFix("t1")];
    enqueueLocationFix(queue, makeFix("t2"), 100);
    expect(queue).toHaveLength(1);
  });

  it("handles a cap of 1 by keeping only the newest fix", () => {
    const queue = [makeFix("t1")];
    const result = enqueueLocationFix(queue, makeFix("t2"), 1);
    expect(result.map((f) => f.recordedAt)).toEqual(["t2"]);
  });
});
