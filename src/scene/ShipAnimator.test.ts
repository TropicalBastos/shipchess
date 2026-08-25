import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { Animator } from "../animation/Animator";
import { ChessGame } from "../game/ChessGame";
import { Fleet } from "./Fleet";
import { ShipAnimator } from "./ShipAnimator";
import { Effects } from "./effects/sprites";

const TICK = 0.05;

function setup(fen?: string) {
  const scene = new THREE.Scene();
  const fleet = new Fleet(scene);
  const game = new ChessGame(fen);
  fleet.syncTo(game.fen());
  const animator = new Animator();
  const effects = new Effects(scene, animator);
  const sa = new ShipAnimator(fleet, animator, effects, () => 0);
  return { scene, fleet, game, animator, sa };
}

/** Pump animation time until the play() promise resolves; returns seconds. */
async function pump(p: Promise<void>, animator: Animator): Promise<number> {
  let done = false;
  void p.then(() => (done = true));
  let elapsed = 0;
  while (!done) {
    animator.tick(TICK);
    elapsed += TICK;
    // Microtask yield lets awaited continuations register their next tween
    // (deterministic — no wall-clock timers; review P4-14).
    for (let i = 0; i < 5; i++) await Promise.resolve();
    if (elapsed > 10) throw new Error("animation never finished");
  }
  return elapsed;
}

describe("ShipAnimator", () => {
  it("a sail move ends on the post-move position within the 1.2s budget (+turn beats)", async () => {
    const { fleet, game, animator, sa } = setup();
    const move = game.applyMove("e2", "e4");
    const seconds = await pump(sa.play(move), animator);
    fleet.update(0);
    expect(fleet.shipAt("e4")).toEqual({ type: "p", color: "w" });
    expect(fleet.shipAt("e2")).toBeNull();
    expect(seconds).toBeLessThanOrEqual(1.4);
  });

  it("castling sails king and rook simultaneously", async () => {
    const { fleet, game, animator, sa } = setup(
      "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1",
    );
    const move = game.applyMove("e1", "g1");
    const p = sa.play(move);
    // Advance into the middle of the sail phase.
    for (let i = 0; i < 12; i++) {
      animator.tick(TICK);
      await new Promise((r) => setTimeout(r, 0));
    }
    const king = fleet.handleAt("e1") ?? fleet.handleAt("g1");
    const rook = fleet.handleAt("h1") ?? fleet.handleAt("f1");
    // Mid-animation both rest anchors have left their origins (parallel legs).
    expect(king).toBeTruthy();
    expect(rook).toBeTruthy();
    const kingMoved = Math.abs(king!.restX - 0.5) > 0.01; // e1 x = 0.5
    const rookMoved = Math.abs(rook!.restX - 3.5) > 0.01; // h1 x = 3.5
    expect(kingMoved && rookMoved).toBe(true);
    await pump(p, animator);
    fleet.update(0);
    expect(fleet.shipAt("g1")).toEqual({ type: "k", color: "w" });
    expect(fleet.shipAt("f1")).toEqual({ type: "r", color: "w" });
  });

  it("capture sinks the victim, fills the tally, and stays under 2.5s", async () => {
    const { scene, fleet, game, animator, sa } = setup(
      "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1",
    );
    const move = game.applyMove("e4", "d5");
    const p = sa.play(move);
    // Mid-animation: victim is sinking (below the surface line).
    for (let i = 0; i < 14; i++) {
      animator.tick(TICK);
      await new Promise((r) => setTimeout(r, 0));
    }
    fleet.update(0);
    const sunkVisible = scene.children.some(
      (c) => c.name.startsWith("ship-") && c.position.y < -0.15,
    );
    expect(sunkVisible).toBe(true);
    const seconds = await pump(p, animator);
    expect(seconds).toBeLessThanOrEqual(2.5);
    fleet.update(0);
    expect(fleet.shipAt("d5")).toEqual({ type: "p", color: "w" });
    // Tally: one captured black ship resurfaced at white's (east) edge.
    fleet.update(1);
    const tallyShip = scene.children.find(
      (c) => c.name.startsWith("ship-") && c.position.x > 5,
    );
    expect(tallyShip).toBeTruthy();
  });

  it("the knight-submarine dives below the surface mid-travel", async () => {
    const { scene, fleet, game, animator, sa } = setup();
    const move = game.applyMove("g1", "f3");
    const p = sa.play(move);
    let sawDive = false;
    for (let i = 0; i < 24; i++) {
      animator.tick(TICK);
      await new Promise((r) => setTimeout(r, 0));
      fleet.update(0);
      const subs = scene.children.filter((c) => c.name === "ship-n");
      if (subs.some((s) => s.position.y < -0.2)) sawDive = true;
    }
    expect(sawDive).toBe(true);
    await pump(p, animator);
    fleet.update(0);
    expect(fleet.shipAt("f3")).toEqual({ type: "n", color: "w" });
  });

  it("promotion swaps the pawn for the chosen ship, which rises", async () => {
    const { fleet, game, animator, sa } = setup(
      "4k3/1P6/8/8/8/8/8/4K3 w - - 0 1",
    );
    const move = game.applyMove("b7", "b8", "q");
    const seconds = await pump(sa.play(move), animator);
    fleet.update(0);
    expect(fleet.shipAt("b8")).toEqual({ type: "q", color: "w" });
    expect(seconds).toBeLessThanOrEqual(2.5);
  });

  it("instantMode: a full move completes with ZERO ticks (hidden-tab contract)", async () => {
    const { fleet, game, animator, sa } = setup();
    animator.instantMode = true;
    const move = game.applyMove("e2", "e4");
    await sa.play(move); // must resolve without any animator.tick()
    fleet.update(0);
    expect(fleet.shipAt("e4")).toEqual({ type: "p", color: "w" });
    expect(animator.active).toBe(false);
  });

  it("promotion-with-capture (worst-case composition) stays under 2.5s", async () => {
    const { fleet, game, animator, sa } = setup("rn2k3/1P6/8/8/8/8/8/4K3 w q - 0 1");
    const move = game.applyMove("b7", "a8", "q");
    const seconds = await pump(sa.play(move), animator);
    expect(seconds).toBeLessThanOrEqual(2.5);
    fleet.update(0);
    expect(fleet.shipAt("a8")).toEqual({ type: "q", color: "w" });
  });

  it("wake puffs are actually emitted during a sail (sprites appear)", async () => {
    const { scene, game, animator, sa } = setup();
    const move = game.applyMove("d2", "d4");
    const p = sa.play(move);
    let sawSprite = false;
    for (let i = 0; i < 20; i++) {
      animator.tick(TICK);
      for (let j = 0; j < 5; j++) await Promise.resolve();
      if (scene.children.some((c) => (c as THREE.Sprite).isSprite)) sawSprite = true;
    }
    expect(sawSprite).toBe(true);
    await pump(p, animator);
  });

  it("mutual captures build tallies on BOTH edges", async () => {
    const { scene, fleet, game, animator, sa } = setup(
      "4k3/8/1n6/3p1p2/4P3/8/8/4K3 w - - 0 1",
    );
    await pump(sa.play(game.applyMove("e4", "d5")), animator); // exd5
    await pump(sa.play(game.applyMove("b6", "d5")), animator); // Nxd5 back
    fleet.update(1);
    const east = scene.children.filter(
      (c) => c.name.startsWith("ship-") && c.position.x > 5,
    );
    const west = scene.children.filter(
      (c) => c.name.startsWith("ship-") && c.position.x < -5,
    );
    expect(east).toHaveLength(1); // black pawn white captured
    expect(west).toHaveLength(1); // white pawn black recaptured
    expect(east[0].name).toBe("ship-p");
    expect(west[0].name).toBe("ship-p");
  });

  it("en passant sinks the pawn on the passed square, not the destination", async () => {
    const { fleet, game, animator, sa } = setup();
    for (const [f, t] of [
      ["e2", "e4"],
      ["a7", "a6"],
      ["e4", "e5"],
    ] as const) {
      await pump(sa.play(game.applyMove(f, t)), animator);
    }
    const ep = game.applyMove("d7", "d5");
    await pump(sa.play(ep), animator);
    const cap = game.applyMove("e5", "d6");
    expect(cap.capturedSquare).toBe("d5");
    await pump(sa.play(cap), animator);
    fleet.update(0);
    expect(fleet.shipAt("d6")).toEqual({ type: "p", color: "w" });
    expect(fleet.shipAt("d5")).toBeNull();
  });
});
