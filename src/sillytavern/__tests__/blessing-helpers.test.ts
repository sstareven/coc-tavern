import { describe, it, expect } from "vitest";
import { getBlessingDamageOptions, formatDamageExpr } from "../blessing-helpers";

describe("getBlessingDamageOptions", () => {
  describe("invalid inputs", () => {
    it("empty string returns []", () => expect(getBlessingDamageOptions("")).toEqual([]));
    it("null returns []", () => expect(getBlessingDamageOptions(null)).toEqual([]));
    it("whitespace returns []", () => expect(getBlessingDamageOptions("   ")).toEqual([]));
  });
  describe("pure integer", () => {
    it("3 -> [3]", () => expect(getBlessingDamageOptions("3")).toEqual([3]));
    it("0 -> [0]", () => expect(getBlessingDamageOptions("0")).toEqual([0]));
  });
  describe("single die", () => {
    it("1D6 -> [1..6]", () => expect(getBlessingDamageOptions("1D6")).toEqual([1,2,3,4,5,6]));
    it("1d4 -> [1..4]", () => expect(getBlessingDamageOptions("1d4")).toEqual([1,2,3,4]));
  });
  describe("single die + constant", () => {
    it("1D6+2 -> [3..8]", () => expect(getBlessingDamageOptions("1D6+2")).toEqual([3,4,5,6,7,8]));
    it("2D6-1 -> [1..11]", () => {
      const r = getBlessingDamageOptions("2D6-1");
      expect(r[0]).toBe(1);
      expect(r[r.length-1]).toBe(11);
    });
  });
  describe("multi-dice", () => {
    it("2D6 -> [2..12]", () => {
      const r = getBlessingDamageOptions("2D6");
      expect(r[0]).toBe(2);
      expect(r[r.length-1]).toBe(12);
    });
    it("1D4+1D6+1 -> [3..11]", () => {
      const r = getBlessingDamageOptions("1D4+1D6+1");
      expect(r[0]).toBe(3);
      expect(r[r.length-1]).toBe(11);
    });
    it("5D100 large range sampled", () => {
      const r = getBlessingDamageOptions("5D100");
      expect(r.length).toBeLessThanOrEqual(20);
      expect(r[0]).toBe(5);
      expect(r[r.length-1]).toBe(500);
    });
  });
  describe("subtraction", () => {
    it("1D6-1 -> [0..5]", () => expect(getBlessingDamageOptions("1D6-1")).toEqual([0,1,2,3,4,5]));
    it("2D6-3 -> [0..9]", () => {
      const r = getBlessingDamageOptions("2D6-3");
      expect(r[0]).toBe(0);
      expect(r[r.length-1]).toBe(9);
    });
  });
  describe("edge", () => {
    it("1D1 -> [1]", () => expect(getBlessingDamageOptions("1D1")).toEqual([1]));
  });
});

describe("getBlessingDamageOptions - negative clamp", () => {
  it("-5 all negative -> [0]", () => {
    expect(getBlessingDamageOptions("-5")).toEqual([0]);
  });
  it("1D6-8 partly negative -> only non-negative", () => {
    const r = getBlessingDamageOptions("1D6-8");
    expect(r.every(v => v >= 0)).toBe(true);
  });
  it("-5 pure negative constant -> [0]", () => {
    expect(getBlessingDamageOptions("-5")).toEqual([0]);
  });
  it("1D3+1 positive unaffected", () => {
    expect(getBlessingDamageOptions("1D3+1")).toEqual([2, 3, 4]);
  });
});
describe("formatDamageExpr", () => {
  it("uppercases and strips spaces", () => expect(formatDamageExpr("1d6+2")).toBe("1D6+2"));
  it("empty returns empty", () => expect(formatDamageExpr("")).toBe(""));
});