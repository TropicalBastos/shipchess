import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";

describe("toolchain sanity", () => {
  it("chess.js produces 20 legal opening moves", () => {
    expect(new Chess().moves().length).toBe(20);
  });
});
