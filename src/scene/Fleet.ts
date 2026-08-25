/**
 * The fleet: 32 ship instances, square ↔ world mapping, position sync from
 * FEN, and buoyancy. Per the Phase 1 work-review disposition (W-02), ship
 * orientation comes from MULTI-POINT POSITIONAL SAMPLING of the wave forward
 * map — cross products of hull-point differences — never from WaveField's
 * analytic normal. Per-class tilt clamps and bob scaling per the plan.
 */
import * as THREE from "three";
import type { PieceType } from "./ships/builders";
import { buildShip, SHIP_SPECS } from "./ships/builders";
import type { FleetMaterials } from "./ships/parts";
import { makeFleetMaterials } from "./ships/parts";
import type { PieceColor, PlacedPiece } from "./fen";
import { parseFenPlacement } from "./fen";
import { displace } from "./WaveField";
import { BOARD_HALF, SQUARE_SIZE } from "./waveConstants";

const FILES = "abcdefgh";

export function squareToWorld(square: string): { x: number; z: number } {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  if (file < 0 || rank < 1 || rank > 8) throw new Error(`bad square ${square}`);
  return {
    x: -BOARD_HALF + SQUARE_SIZE * (file + 0.5),
    z: BOARD_HALF - SQUARE_SIZE * (rank - 0.5),
  };
}

export function worldToSquare(x: number, z: number): string | null {
  const file = Math.floor((x + BOARD_HALF) / SQUARE_SIZE);
  const rank = Math.floor((BOARD_HALF - z) / SQUARE_SIZE) + 1;
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null;
  return FILES[file] + rank;
}

interface ShipInstance {
  object: THREE.Group;
  shadow: THREE.Mesh;
  type: PieceType;
  color: PieceColor;
  square: string;
  /** Rest anchor (parameter space) — the wave forward map advects from here. */
  restX: number;
  restZ: number;
  yaw: number;
  phase: number; // small per-ship phase offset so idle bobbing de-syncs
}

let shadowTexture: THREE.CanvasTexture | null = null;
function getShadowTexture(): THREE.CanvasTexture {
  if (!shadowTexture) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, "rgba(6,20,28,0.4)");
    grad.addColorStop(1, "rgba(6,20,28,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    shadowTexture = new THREE.CanvasTexture(c);
  }
  return shadowTexture;
}

export class Fleet {
  private readonly scene: THREE.Scene;
  private readonly materials: Record<PieceColor, FleetMaterials>;
  private ships: ShipInstance[] = [];
  private pools: Record<PieceColor, Map<PieceType, THREE.Group[]>> = {
    w: new Map(),
    b: new Map(),
  };

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.materials = { w: makeFleetMaterials(true), b: makeFleetMaterials(false) };
  }

  /** Rebuild ship placement from a FEN string (full sync, pool-reusing). */
  syncTo(fen: string): void {
    const placement = parseFenPlacement(fen);
    // Return all current ships to the pools.
    for (const s of this.ships) {
      this.scene.remove(s.object, s.shadow);
      const pool = this.pools[s.color].get(s.type) ?? [];
      pool.push(s.object);
      this.pools[s.color].set(s.type, pool);
    }
    this.ships = placement.map((p) => this.spawn(p));
  }

  private spawn(p: PlacedPiece): ShipInstance {
    const pool = this.pools[p.color].get(p.type) ?? [];
    const object = pool.pop() ?? buildShip(p.type, this.materials[p.color]);
    const { x, z } = squareToWorld(p.square);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(
        SHIP_SPECS[p.type].beam * 2.2,
        SHIP_SPECS[p.type].length * 1.6,
      ),
      new THREE.MeshBasicMaterial({
        map: getShadowTexture(),
        transparent: true,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    this.scene.add(object, shadow);
    return {
      object,
      shadow,
      type: p.type,
      color: p.color,
      square: p.square,
      restX: x,
      restZ: z,
      // White fleet faces -Z (toward black's ranks), black faces +Z.
      yaw: p.color === "w" ? 0 : Math.PI,
      phase: ((x * 7.13 + z * 3.71) % 1) * 0.6,
    };
  }

  shipAt(square: string): { type: PieceType; color: PieceColor } | null {
    const s = this.ships.find((i) => i.square === square);
    return s ? { type: s.type, color: s.color } : null;
  }

  get flagships(): THREE.Group[] {
    return this.ships.filter((s) => s.type === "k").map((s) => s.object);
  }

  private static _f = new THREE.Vector3();
  private static _r = new THREE.Vector3();
  private static _up = new THREE.Vector3();
  private static _q = new THREE.Quaternion();
  private static _yawQ = new THREE.Quaternion();
  private static _Y = new THREE.Vector3(0, 1, 0);

  /** Buoyancy: multi-point hull sampling of the wave forward map. */
  update(t: number): void {
    for (const s of this.ships) {
      const spec = SHIP_SPECS[s.type];
      const tt = t + s.phase;
      const halfL = spec.length * 0.38;
      const halfB = spec.beam * 0.5;
      // Sample bow, stern, port, starboard in the ship's heading frame.
      const cos = Math.cos(s.yaw);
      const sin = Math.sin(s.yaw);
      const bow = displace(s.restX - sin * halfL, s.restZ - cos * halfL, tt);
      const stern = displace(s.restX + sin * halfL, s.restZ + cos * halfL, tt);
      const port = displace(s.restX - cos * halfB, s.restZ + sin * halfB, tt);
      const star = displace(s.restX + cos * halfB, s.restZ - sin * halfB, tt);
      const cx = (bow.x + stern.x + port.x + star.x) / 4;
      const cy = (bow.y + stern.y + port.y + star.y) / 4;
      const cz = (bow.z + stern.z + port.z + star.z) / 4;

      // Deck normal from hull-point differences (cross product), never the
      // analytic normal (Phase 1 review W-02).
      const F = Fleet._f.set(bow.x - stern.x, bow.y - stern.y, bow.z - stern.z);
      const R = Fleet._r.set(star.x - port.x, star.y - port.y, star.z - port.z);
      const up = Fleet._up.copy(R).cross(F).normalize();
      if (up.y < 0) up.negate();

      // Per-class tilt clamp: cap the angle between deck normal and world up.
      const angle = up.angleTo(Fleet._Y);
      if (angle > spec.maxTilt) {
        up.lerp(Fleet._Y, 1 - spec.maxTilt / angle).normalize();
      }

      s.object.position.set(cx, cy * spec.bobScale, cz);
      Fleet._q.setFromUnitVectors(Fleet._Y, up);
      Fleet._yawQ.setFromAxisAngle(Fleet._Y, s.yaw);
      s.object.quaternion.copy(Fleet._q).multiply(Fleet._yawQ);

      s.shadow.position.set(cx, cy * spec.bobScale + 0.005, cz);
      s.shadow.rotation.z = -s.yaw;
    }
  }
}
