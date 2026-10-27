import { describe, it, expect } from "vitest";
import { total } from "../server.js";

describe("paas-app", () => {
  it("totals carts", () => {
    expect(total([{ price: 2, qty: 3 }])).toBe(6);
  });
});
