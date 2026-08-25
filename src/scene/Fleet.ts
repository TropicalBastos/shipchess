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
  /** Animation state (Phase 4): downward offset & extra roll about forward. */
  sink: number;
  list: number;
}

/** Mutable animation handle over one ship. Invalidated by the next syncTo. */
export interface ShipHandle {
  readonly type: PieceType;
  readonly color: PieceColor;
  readonly restX: number;
  readonly restZ: number;
  readonly yaw: number;
  setRest(x: number, z: number): void;
  setYaw(yaw: number): void;
  setSink(depth: number): void;
  setList(rad: number): void;
  /** Current world position (post-buoyancy, from the last update). */
  worldPosition(): THREE.Vector3;
}

// Shared shadow resources: one texture+material for the whole fleet, one
// geometry per class — nothing to dispose or leak across syncs (review W2-02).
let shadowMaterial: THREE.MeshBasicMaterial | null = null;
function getShadowMaterial(): THREE.MeshBasicMaterial {
  if (!shadowMaterial) {
    let map: THREE.CanvasTexture | null = null;
    const ctx =
      typeof document !== "undefined"
        ? document.createElement("canvas").getContext("2d")
        : null;
    if (ctx) {
      const c = ctx.canvas;
      c.width = c.height = 64;
      const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
      grad.addColorStop(0, "rgba(6,20,28,0.4)");
      grad.addColorStop(1, "rgba(6,20,28,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      map = new THREE.CanvasTexture(c);
    }
    shadowMaterial = new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      depthWrite: false,
      opacity: map ? 1 : 0, // headless (tests): no canvas, invisible shadow
    });
  }
  return shadowMaterial;
}

const shadowGeometries = new Map<PieceType, THREE.PlaneGeometry>();
function getShadowGeometry(type: PieceType): THREE.PlaneGeometry {
  let g = shadowGeometries.get(type);
  if (!g) {
    g = new THREE.PlaneGeometry(
      SHIP_SPECS[type].beam * 2.2,
      SHIP_SPECS[type].length * 1.6,
    );
    shadowGeometries.set(type, g);
  }
  return g;
}

export class Fleet {
  private readonly scene: THREE.Scene;
  private readonly materials: Record<PieceColor, FleetMaterials>;
  private ships: ShipInstance[] = [];
  private pools: Record<
    PieceColor,
    Map<PieceType, Array<{ object: THREE.Group; shadow: THREE.Mesh }>>
  > = {
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
    // Return all current ships (with their paired shadows) to the pools.
    for (const s of this.ships) {
      this.scene.remove(s.object, s.shadow);
      const pool = this.pools[s.color].get(s.type) ?? [];
      pool.push({ object: s.object, shadow: s.shadow });
      this.pools[s.color].set(s.type, pool);
    }
    this.ships = placement.map((p) => this.spawn(p));
  }

  private spawn(p: PlacedPiece): ShipInstance {
    const pool = this.pools[p.color].get(p.type) ?? [];
    let pair = pool.pop();
    if (!pair) {
      const shadow = new THREE.Mesh(getShadowGeometry(p.type), getShadowMaterial());
      shadow.rotation.x = -Math.PI / 2;
      pair = { object: buildShip(p.type, this.materials[p.color]), shadow };
    }
    const { x, z } = squareToWorld(p.square);
    this.scene.add(pair.object, pair.shadow);
    return {
      object: pair.object,
      shadow: pair.shadow,
      type: p.type,
      color: p.color,
      square: p.square,
      restX: x,
      restZ: z,
      // White fleet faces -Z (toward black's ranks), black faces +Z.
      yaw: p.color === "w" ? 0 : Math.PI,
      sink: 0,
      list: 0,
    };
  }

  /** Animation handle for `color`'s flagship (end-of-game flourish). */
  flagshipHandle(color: PieceColor): ShipHandle | null {
    const s = this.ships.find((i) => i.type === "k" && i.color === color);
    return s ? this.makeHandle(s) : null;
  }

  /** Animation handle for the ship on `square` (null if empty). */
  handleAt(square: string): ShipHandle | null {
    const s = this.ships.find((i) => i.square === square);
    if (!s) return null;
    return this.makeHandle(s);
  }

  private makeHandle(s: ShipInstance): ShipHandle {
    return {
      get type() {
        return s.type;
      },
      get color() {
        return s.color;
      },
      get restX() {
        return s.restX;
      },
      get restZ() {
        return s.restZ;
      },
      get yaw() {
        return s.yaw;
      },
      setRest: (x, z) => {
        s.restX = x;
        s.restZ = z;
      },
      setYaw: (yaw) => {
        s.yaw = yaw;
      },
      setSink: (depth) => {
        s.sink = depth;
      },
      setList: (rad) => {
        s.list = rad;
      },
      worldPosition: () => s.object.position.clone(),
    };
  }

  /**
   * Captured-ship tally: sunk ships resurface in a line along the captor's
   * board edge (east edge for ships Ivory captured, west for Charcoal's
   * prizes), riding the open water. Rebuilt from the full captured list.
   */
  setCaptured(captured: Array<{ type: PieceType; color: PieceColor }>): void {
    for (const s of this.tally) {
      this.scene.remove(s.object, s.shadow);
      const pool = this.pools[s.color].get(s.type) ?? [];
      pool.push({ object: s.object, shadow: s.shadow });
      this.pools[s.color].set(s.type, pool);
    }
    this.tally = [];
    const counts: Record<PieceColor, number> = { w: 0, b: 0 };
    for (const c of captured) {
      // A captured black ship was taken by white → white's (east) edge.
      const east = c.color === "b";
      const i = counts[c.color]++;
      const x = (east ? 1 : -1) * (BOARD_HALF + 1.6);
      const z = -3 + i * 0.85;
      const pool = this.pools[c.color].get(c.type) ?? [];
      let pair = pool.pop();
      if (!pair) {
        const shadow = new THREE.Mesh(getShadowGeometry(c.type), getShadowMaterial());
        shadow.rotation.x = -Math.PI / 2;
        pair = { object: buildShip(c.type, this.materials[c.color]), shadow };
      }
      this.scene.add(pair.object, pair.shadow);
      this.tally.push({
        object: pair.object,
        shadow: pair.shadow,
        type: c.type,
        color: c.color,
        square: "",
        restX: x,
        restZ: z,
        yaw: east ? Math.PI / 2 : -Math.PI / 2,
        sink: 0,
        list: 0,
      });
    }
  }

  private tally: ShipInstance[] = [];

  shipAt(square: string): { type: PieceType; color: PieceColor } | null {
    const s = this.ships.find((i) => i.square === square);
    return s ? { type: s.type, color: s.color } : null;
  }

  private checkedColor: PieceColor | null = null;

  /** Masthead running lights: intensity by time of day (0 = off by day). */
  setLampIntensity(v: number): void {
    this.materials.w.lamp.emissiveIntensity = v;
    this.materials.b.lamp.emissiveIntensity = v;
  }

  /** Check indication: the checked side's flagship signal light flashes red. */
  setCheck(color: PieceColor | null): void {
    if (this.checkedColor && this.checkedColor !== color) {
      const m = this.materials[this.checkedColor].signal;
      m.emissive.set(this.checkedColor === "w" ? "#f2e9c8" : "#bfe8e2");
      m.emissiveIntensity = 0.6;
    }
    this.checkedColor = color;
  }

  get flagships(): THREE.Group[] {
    return this.ships.filter((s) => s.type === "k").map((s) => s.object);
  }

  private static _f = new THREE.Vector3();
  private static _r = new THREE.Vector3();
  private static _up = new THREE.Vector3();
  private static _axis = new THREE.Vector3();
  private static _listQ = new THREE.Quaternion();
  private static _Z = new THREE.Vector3(0, 0, 1);
  private static _q = new THREE.Quaternion();
  private static _yawQ = new THREE.Quaternion();
  private static _Y = new THREE.Vector3(0, 1, 0);

  /** Buoyancy: multi-point hull sampling of the wave forward map. */
  update(t: number): void {
    if (this.checkedColor) {
      const m = this.materials[this.checkedColor].signal;
      m.emissive.set("#ff2214");
      m.emissiveIntensity = 1.2 + Math.sin(t * 9) * 1.0;
    }
    this.updateGroup(this.ships, t);
    this.updateGroup(this.tally, t);
  }

  // Split to avoid a per-frame combined-array allocation (review P4-07).
  private updateGroup(group: ShipInstance[], t: number): void {
    for (const s of group) {
      const spec = SHIP_SPECS[s.type];
      // Shared, unshifted time: ships must ride the exact surface the GPU
      // renders (review W2-01 — natural desync comes from rest positions).
      const tt = t;
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

      // Per-class tilt clamp: exact angular cap (review W2-07 — lerp
      // overshoots; rotate world-up toward the deck normal by exactly maxTilt).
      const angle = up.angleTo(Fleet._Y);
      if (angle > spec.maxTilt) {
        Fleet._axis.copy(Fleet._Y).cross(up);
        if (Fleet._axis.lengthSq() > 1e-12) {
          Fleet._axis.normalize();
          up.copy(Fleet._Y).applyAxisAngle(Fleet._axis, spec.maxTilt);
        } else {
          up.copy(Fleet._Y);
        }
      }

      s.object.position.set(cx, cy * spec.bobScale - s.sink, cz);
      Fleet._q.setFromUnitVectors(Fleet._Y, up);
      Fleet._yawQ.setFromAxisAngle(Fleet._Y, s.yaw);
      s.object.quaternion.copy(Fleet._q).multiply(Fleet._yawQ);
      if (s.list !== 0) {
        Fleet._listQ.setFromAxisAngle(Fleet._Z, s.list);
        s.object.quaternion.multiply(Fleet._listQ);
      }

      s.shadow.visible = s.sink < 0.05;
      s.shadow.position.set(cx, cy * spec.bobScale + 0.005, cz);
      s.shadow.rotation.z = -s.yaw;
    }
  }
}
