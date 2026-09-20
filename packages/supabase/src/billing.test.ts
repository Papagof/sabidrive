import { describe, expect, it } from "vitest";
import { computeBillingAmountKobo } from "./billing";

describe("computeBillingAmountKobo", () => {
  it("charges zero for a school with no students", () => {
    expect(computeBillingAmountKobo(0)).toBe(0);
  });

  it("charges ₦20,000 (2,000,000 kobo) for one student", () => {
    expect(computeBillingAmountKobo(1)).toBe(2_000_000);
  });

  it("scales linearly for a large roster with no fractional-kobo surprises", () => {
    expect(computeBillingAmountKobo(347)).toBe(347 * 2_000_000);
  });

  it("never returns a negative amount for a malformed negative count", () => {
    expect(computeBillingAmountKobo(-5)).toBe(0);
  });
});
