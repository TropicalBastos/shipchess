import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { parseFenPlacement, START_FEN } from "./fen";
import { squareToWorld, worldToSquare } from "./Fleet";
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

  it("returns null outside the board and maps known corners", () => {
    expect(worldToSquare(100, 0)).toBeNull();
    expect(squareToWorld("a1")).toEqual({ x: -3.5, z: 3.5 });
    expect(squareToWorld("h8")).toEqual({ x: 3.5, z: -3.5 });
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
      const height = bbox.max.y;
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
