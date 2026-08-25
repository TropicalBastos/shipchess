import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { parseFenPlacement, START_FEN } from "./fen";
import { Fleet, squareToWorld, worldToSquare } from "./Fleet";
import { buildShip, SHIP_SPECS } from "./ships/builders";
import type { PieceType } from "./ships/builders";
import { makeFleetMaterials } from "./ships/parts";
import { SQUARE_SIZE } from "./waveConstants";

const FILES = "abcdefgh";
const ALL_TYPES: PieceType[] = ["p", "n", "b", "r", "q", "k"];

describe("square ↔ world mapping", () => {
  it("round-trips all 64 squares", () => {
    for (const f of FILES) {
      for (let r = 1; r <= 8; r++) {
        const sq = f + r;
        const { x, z } = squareToWorld(sq);
        expect(worldToSquare(x, z)).toBe(sq);
      }
    }
  });

  it("returns null outside the board and maps anchor squares exactly", () => {
    expect(worldToSquare(100, 0)).toBeNull();
    expect(squareToWorld("a1")).toEqual({ x: -3.5, z: 3.5 });
    expect(squareToWorld("h8")).toEqual({ x: 3.5, z: -3.5 });
    // Off-diagonal anchors: a file/rank transposition cannot pass these.
    expect(squareToWorld("a8")).toEqual({ x: -3.5, z: -3.5 });
    expect(squareToWorld("h1")).toEqual({ x: 3.5, z: 3.5 });
    expect(squareToWorld("e4")).toEqual({ x: 0.5, z: 0.5 });
    expect(squareToWorld("b7")).toEqual({ x: -2.5, z: -2.5 });
  });

  it("checker parity matches chess law (a1 dark, h1 light)", () => {
    // Replicates the Ocean fragment formula: cell = floor(rest + BOARD_HALF),
    // checker = (cell.x + cell.y + 1) mod 2; 1 selects the light square.
    const parity = (sq: string) => {
      const { x, z } = squareToWorld(sq);
      return (Math.floor(x + 4) + Math.floor(z + 4) + 1) % 2;
    };
    expect(parity("a1")).toBe(0); // dark
    expect(parity("h1")).toBe(1); // light
    expect(parity("a8")).toBe(1); // light
    expect(parity("h8")).toBe(0); // dark
    expect(parity("d1")).toBe(1); // white queen starts on her color (light)
    expect(parity("d8")).toBe(0); // black queen starts on her color (dark)
    expect(parity("e4")).toBe(1); // light
  });
});

describe("FEN placement parser", () => {
  it("parses the starting position: 32 pieces on the right squares", () => {
    const pieces = parseFenPlacement(START_FEN);
    expect(pieces).toHaveLength(32);
    const at = (sq: string) => pieces.find((p) => p.square === sq);
    expect(at("e1")).toMatchObject({ type: "k", color: "w" });
    expect(at("d8")).toMatchObject({ type: "q", color: "b" });
    expect(at("a2")).toMatchObject({ type: "p", color: "w" });
    expect(at("g8")).toMatchObject({ type: "n", color: "b" });
    expect(at("e4")).toBeUndefined();
  });

  it("rejects malformed placements", () => {
    expect(() => parseFenPlacement("8/8/8 w - - 0 1")).toThrow();
    expect(() => parseFenPlacement("9/8/8/8/8/8/8/8 w - - 0 1")).toThrow();
    expect(() => parseFenPlacement("xnbqkbnr/8/8/8/8/8/8/8 w - - 0 1")).toThrow();
  });
});

describe("fleet physical contract", () => {
  const materials = makeFleetMaterials(true);

  for (const type of ALL_TYPES) {
    it(`${type}: waterline footprint <= 0.8x0.8 and no square overlap at max tilt`, () => {
      const ship = buildShip(type, materials);
      ship.updateMatrixWorld(true);
      const bbox = new THREE.Box3().setFromObject(ship);
      const sizeX = bbox.max.x - bbox.min.x;
      const sizeZ = bbox.max.z - bbox.min.z;
      // Full vertical extent — hulls extend below the waterline too (W2-05).
      const height = bbox.max.y - bbox.min.y;
      expect(sizeX).toBeLessThanOrEqual(0.8 + 1e-6);
      expect(sizeZ).toBeLessThanOrEqual(0.8 + 1e-6);
      // At max tilt the horizontal projection grows by height*sin(tilt);
      // it must stay inside the 1.0-unit square.
      const tilt = SHIP_SPECS[type].maxTilt;
      const projected =
        Math.max(sizeX, sizeZ) * Math.cos(tilt) + height * Math.sin(tilt);
      expect(projected).toBeLessThanOrEqual(SQUARE_SIZE + 1e-6);
    });
  }

  it("ranks read through height: flagship tallest, patrol boat lowest", () => {
    const heights = Object.fromEntries(
      ALL_TYPES.map((t) => {
        const bbox = new THREE.Box3().setFromObject(buildShip(t, materials));
        return [t, bbox.max.y];
      }),
    ) as Record<PieceType, number>;
    expect(heights.k).toBeGreaterThan(heights.q);
    expect(heights.k).toBeGreaterThan(heights.r);
    for (const t of ["n", "b", "r", "q", "k"] as PieceType[]) {
      expect(heights[t]).toBeGreaterThan(heights.p);
    }
  });

  it("flagship carries the named signal light", () => {
    const ship = buildShip("k", materials);
    expect(ship.getObjectByName("signalLight")).toBeTruthy();
  });
});

describe("Fleet behavior (headless)", () => {
  it("syncTo places 32 ships; double-sync reuses instances, no growth", () => {
    const scene = new THREE.Scene();
    const fleet = new Fleet(scene);
    fleet.syncTo(START_FEN);
    expect(scene.children).toHaveLength(64); // 32 ships + 32 shadows
    const firstObjects = new Set(scene.children);
    fleet.syncTo(START_FEN);
    expect(scene.children).toHaveLength(64);
    for (const child of scene.children) expect(firstObjects.has(child)).toBe(true);
  });

  it("shipAt reports the right pieces", () => {
    const fleet = new Fleet(new THREE.Scene());
    fleet.syncTo(START_FEN);
    expect(fleet.shipAt("e1")).toEqual({ type: "k", color: "w" });
    expect(fleet.shipAt("d8")).toEqual({ type: "q", color: "b" });
    expect(fleet.shipAt("e4")).toBeNull();
    expect(fleet.flagships).toHaveLength(2);
  });

  it("update keeps every ship within its class tilt clamp and near its square", () => {
    const scene = new THREE.Scene();
    const fleet2 = new Fleet(scene);
    fleet2.syncTo(START_FEN);
    const up = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    for (const t of [0, 3.7, 111.2, 400.9]) {
      fleet2.update(t);
      for (const child of scene.children) {
        if (!child.name.startsWith("ship-")) continue;
        const type = child.name.slice(5) as PieceType;
        up.set(0, 1, 0).applyQuaternion(child.quaternion);
        const tilt = up.angleTo(new THREE.Vector3(0, 1, 0));
        expect(tilt).toBeLessThanOrEqual(SHIP_SPECS[type].maxTilt + 1e-6);
        // Horizontal advection stays well inside the square.
        const sq = worldToSquare(child.position.x, child.position.z);
        expect(sq).not.toBeNull();
      }
    }
    // Headings: white fleet faces -Z, black faces +Z (dominantly).
    fleet2.update(0);
    const white = scene.children.find(
      (c) => c.name.startsWith("ship-") && c.position.z > 2,
    )!;
    const black = scene.children.find(
      (c) => c.name.startsWith("ship-") && c.position.z < -2,
    )!;
    fwd.set(0, 0, -1).applyQuaternion(white.quaternion);
    expect(fwd.z).toBeLessThan(-0.9);
    fwd.set(0, 0, -1).applyQuaternion(black.quaternion);
    expect(fwd.z).toBeGreaterThan(0.9);
  });
});
