import { describe, it, expect } from "vitest";
import worker from "../src/worker.js";

describe("worker-app", () => {
  it("serves /", async () => {
    const res = await worker.fetch(new Request("https://x/"), {});
    expect(await res.text()).toBe("ok");
  });
});
