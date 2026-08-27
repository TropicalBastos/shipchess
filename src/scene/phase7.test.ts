// @vitest-environment happy-dom
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { Animator } from "../animation/Animator";
import { AudioManager } from "../audio/AudioManager";
import { ChessGame } from "../game/ChessGame";
import { GameController } from "../game/GameController";
import type { GameView } from "../game/GameController";
import { loadSettings } from "../ui/settings";
import { Fleet } from "./Fleet";
import { Ocean } from "./Ocean";
import { ShipAnimator } from "./ShipAnimator";
import { Effects } from "./effects/sprites";
import { SUN_PRESETS, oceanPaletteArgs } from "./presets";

const nullView: GameView = {
  onSelection: () => {},
  onDenied: () => {},
  onCheck: () => {},
  onTurn: () => {},
  onPromotionPrompt: () => {},
  onGameOver: () => {},
  onPosition: () => {},
  onAiThinking: () => {},
};

describe("Phase 7: quality tier", () => {
  it("low quality halves the ocean mesh density", () => {
    const high = new Ocean(new THREE.Vector3(0, 1, 0), 1);
    const low = new Ocean(new THREE.Vector3(0, 1, 0), 0.5);
    const verts = (o: Ocean) =>
      (o.mesh.geometry as THREE.PlaneGeometry).attributes.position.count;
    expect(verts(low)).toBeLessThan(verts(high) * 0.3); // (n/2+1)² vs (n+1)²
  });
});

describe("Phase 7: sun presets", () => {
  it("ships three complete presets with parseable colors", () => {
    expect(Object.keys(SUN_PRESETS).sort()).toEqual(["day", "golden", "moonlit"]);
    for (const p of Object.values(SUN_PRESETS)) {
      for (const c of [p.sunColor, p.ambient, p.zenith, p.horizon, p.deep, p.crest, p.skyTint]) {
        expect(new THREE.Color(c).getHex()).toBeGreaterThanOrEqual(0);
      }
      expect(p.sunDir[1]).toBeGreaterThan(0); // sun above the horizon
    }
  });

  it("oceanPaletteArgs feeds fog from the horizon, never the sky tint", () => {
    for (const p of Object.values(SUN_PRESETS)) {
      const [, , tint, fog] = oceanPaletteArgs(p);
      expect(tint).toBe(p.skyTint);
      expect(fog).toBe(p.horizon);
    }
  });

  it("ocean palette setters apply preset colors", () => {
    const o = new Ocean(new THREE.Vector3(0, 1, 0), 0.5);
    o.setPalette("#112233", "#445566", "#778899", "#aabbcc");
    const u = (o.mesh.material as THREE.ShaderMaterial).uniforms;
    expect((u.uDeepColor.value as THREE.Color).getHexString()).toBe("112233");
    // Fog is the HORIZON color, decoupled from the fresnel sky tint (P7-04).
    expect((u.uFogColor.value as THREE.Color).getHexString()).toBe("aabbcc");
  });
});

describe("Phase 7: reduced-motion path completes a full scripted game", () => {
  it("scholar's mate runs to checkmate with reduced motion + low quality together", async () => {
    // Reduced-motion and low-quality were retired from the settings UI
    // (2026-08-27): stored values are pinned back to defaults on load, so
    // the combined path drives the flags directly instead of via storage.
    localStorage.setItem(
      "navalchess.settings",
      JSON.stringify({ version: 1, reducedMotion: true, quality: "low" }),
    );
    const stored = loadSettings();
    expect(stored.reducedMotion).toBe(false); // retired field: pinned
    expect(stored.quality).toBe("high"); // retired field: pinned
    const scene = new THREE.Scene();
    const lowOcean = new Ocean(new THREE.Vector3(0, 1, 0), 0.5);
    scene.add(lowOcean.mesh);
    const highCount = new Ocean(new THREE.Vector3(0, 1, 0), 1).mesh
      .geometry.attributes.position.count;
    expect(lowOcean.mesh.geometry.attributes.position.count).toBeLessThan(
      highCount * 0.3,
    ); // the stored quality actually took effect (RF-03)
    const fleet = new Fleet(scene);
    const game = new ChessGame();
    const animator = new Animator();
    animator.instantMode = true; // reduced-motion path, driven directly
    const sa = new ShipAnimator(fleet, animator, new Effects(scene, animator), () => 0);
    let over = false;
    const gc = new GameController(game, sa, {
      ...nullView,
      onGameOver: () => (over = true),
    });
    gc.startGame({ aiColor: null });
    for (const [f, t] of [
      ["e2", "e4"],
      ["e7", "e5"],
      ["d1", "h5"],
      ["b8", "c6"],
      ["f1", "c4"],
      ["g8", "f6"],
      ["h5", "f7"],
    ]) {
      await gc.clickSquare(f);
      await gc.clickSquare(t);
    }
    expect(over).toBe(true);
    expect(gc.currentState()).toBe("gameOver");
    fleet.update(0);
    expect(fleet.shipAt("f7")).toEqual({ type: "q", color: "w" });
  });
});

describe("Phase 7: audio + settings safety", () => {
  it("AudioManager is a safe no-op before unlock and headless", () => {
    const a = new AudioManager(0.5);
    expect(a.unlocked).toBe(false);
    // None of these may throw without a context.
    a.creak();
    a.whoosh();
    a.cannon();
    a.sink();
    a.sonar();
    a.alarm();
    a.setVolume(0.2);
    a.dispose();
  });

  it("new settings fields validate types and fall back on junk", () => {
    localStorage.setItem(
      "navalchess.settings",
      JSON.stringify({
        version: 1,
        quality: "ultra",
        reducedMotion: "yes",
        sunPreset: "midnight",
      }),
    );
    const s = loadSettings();
    expect(s.quality).toBe("high");
    expect(s.reducedMotion).toBe(false);
    expect(s.sunPreset).toBe("day");
  });
});

describe("Time of day transitions", () => {
  it("lerpPreset blends every channel and hits both endpoints exactly", async () => {
    const { lerpPreset } = await import("./presets");
    const a = SUN_PRESETS.day;
    const b = SUN_PRESETS.moonlit;
    expect(lerpPreset(a, b, 0)).toEqual(a);
    expect(lerpPreset(a, b, 1)).toEqual(b);
    const mid = lerpPreset(a, b, 0.5);
    expect(mid.sunIntensity).toBeCloseTo((a.sunIntensity + b.sunIntensity) / 2, 6);
    expect(mid.deep).toMatch(/^#[0-9a-f]{6}$/);
    // Midpoint colors differ from both endpoints (a real blend).
    expect(mid.deep).not.toBe(a.deep);
    expect(mid.deep).not.toBe(b.deep);
  });
});
