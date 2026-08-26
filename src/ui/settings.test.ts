// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSettings, saveSettings } from "./settings";

describe("guarded settings store", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips through localStorage", () => {
    const s = loadSettings();
    s.fastAnimations = true;
    saveSettings(s);
    expect(loadSettings().fastAnimations).toBe(true);
  });

  it("falls back to defaults on corrupt or version-mismatched blobs", () => {
    localStorage.setItem("navalchess.settings", "{not json");
    expect(loadSettings().fastAnimations).toBe(false);
    localStorage.setItem("navalchess.settings", JSON.stringify({ version: 99 }));
    expect(loadSettings().cameraGlide).toBe(true);
  });

  it("rejects valid-version blobs with wrong field types (P5-08)", () => {
    localStorage.setItem(
      "navalchess.settings",
      JSON.stringify({ version: 1, fastAnimations: "false", volume: 9 }),
    );
    const s = loadSettings();
    expect(s.fastAnimations).toBe(false); // string coerces to default
    expect(s.volume).toBe(0.8); // out-of-range rejected
  });

  it("survives storage that throws (blocked contexts) — never breaks boot", () => {
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });
    expect(loadSettings().volume).toBe(0.8);
    spy.mockRestore();
    const spy2 = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    expect(() => saveSettings(loadSettings())).not.toThrow();
    spy2.mockRestore();
  });
});
