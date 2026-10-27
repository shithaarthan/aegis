import { describe, it, expect } from "vitest";
import { getUserName, createApp } from "../src/server.js";

describe("vm-app suite (green except seeded fault)", () => {
  it("serves known users", async () => {
    expect(getUserName("alice")).toBe("Alice");
  });
  it("health check shape", async () => {
    const app = createApp();
    await new Promise((resolve) => app.listen(0, resolve));
    const port = app.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(await res.text()).toBe("ok");
    } finally {
      app.close();
    }
  });
});
