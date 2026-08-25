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
import { SUN_PRESETS } from "./presets";

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
    // The combined acceptance path (P7-05): reduced-motion comes from a
    // STORED settings blob, and the low-quality ocean coexists in-scene.
    localStorage.setItem(
      "shipchess.settings",
      JSON.stringify({ version: 1, reducedMotion: true, quality: "low" }),
    );
    const stored = loadSettings();
    expect(stored.reducedMotion).toBe(true);
    const scene = new THREE.Scene();
    scene.add(new Ocean(new THREE.Vector3(0, 1, 0), stored.quality === "low" ? 0.5 : 1).mesh);
    const fleet = new Fleet(scene);
    const game = new ChessGame();
    const animator = new Animator();
    animator.instantMode = stored.reducedMotion; // the main-wiring mapping
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
      "shipchess.settings",
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
