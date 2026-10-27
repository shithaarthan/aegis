import { describe, it, expect } from "vitest";
import { isBadState } from "../api.js";

describe("spa-app", () => {
  it("detects the bad-state fault", () => {
    expect(isBadState({ loaded: true, cart: null })).toBe(true);
    expect(isBadState({ loaded: true, cart: [] })).toBe(false);
  });
});
