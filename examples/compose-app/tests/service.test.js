import { describe, it, expect } from "vitest";
import { parsePort } from "../service.js";

describe("compose-app", () => {
  it("parses ports", () => {
    expect(parsePort("8080:tcp")).toBe(8080);
  });
});
