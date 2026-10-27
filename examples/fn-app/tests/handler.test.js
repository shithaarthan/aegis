import { describe, it, expect } from "vitest";
import { handler } from "../api/handler.js";

describe("fn-app", () => {
  it("handles ids", async () => {
    const res = await handler({ url: "https://x/?id=ABC" });
    expect(res.statusCode).toBe(200);
  });
});
