import { afterEach, describe, expect, it, vi } from "vitest";
import { simulateInstantSpeedKmh } from "./telemetry";

describe("simulateInstantSpeedKmh", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stays near the base speed with no jitter and no spike/brake roll", () => {
    // jitter roll -> 0.5 (no jitter), spike roll -> 0.5 (misses 0.06 threshold)
    vi.spyOn(Math, "random").mockReturnValueOnce(0.5).mockReturnValueOnce(0.5);
    const result = simulateInstantSpeedKmh(25, null);
    expect(result.speedKmh).toBe(25);
    expect(result.isSpeeding).toBe(false);
    expect(result.isHarshBrake).toBe(false);
  });

  it("flags a speeding spike when the spike roll hits", () => {
    // jitter roll -> 0.5 (no jitter), spike roll -> 0.01 (hits 0.06 threshold)
    vi.spyOn(Math, "random").mockReturnValueOnce(0.5).mockReturnValueOnce(0.01);
    const result = simulateInstantSpeedKmh(25, null);
    expect(result.speedKmh).toBe(25 * 1.6);
    expect(result.isSpeeding).toBe(true);
  });

  it("flags a harsh brake when the brake roll hits after a higher previous speed", () => {
    // jitter roll -> 0.5, spike roll -> 0.5 (miss), brake roll -> 0.01 (hit), brake-magnitude roll -> 0.5
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.01)
      .mockReturnValueOnce(0.5);
    const result = simulateInstantSpeedKmh(25, 55);
    expect(result.speedKmh).toBe(35); // max(0, 55 - 15 - 0.5*10)
    expect(result.isSpeeding).toBe(false);
    expect(result.isHarshBrake).toBe(true);
  });

  it("never returns a negative speed", () => {
    // jitter roll -> 0 (minimum, jitter = -JITTER_RANGE_KMH), spike roll -> 0.5 (miss)
    vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0.5);
    const result = simulateInstantSpeedKmh(0, null);
    expect(result.speedKmh).toBeGreaterThanOrEqual(0);
  });
});
