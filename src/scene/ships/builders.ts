/**
 * One procedural builder per ship class, all honoring the fleet's physical
 * contract: square = 1.0 world unit, waterline footprint <= 0.8 x 0.8, rank
 * conveyed by height/mass/superstructure density — never length overhang.
 * Ships are authored facing -Z with the waterline at y = 0.
 */
import * as THREE from "three";
import type { FleetMaterials } from "./parts";
import { block, cylinder, hull, mast, turret } from "./parts";

export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

export interface ShipSpec {
  /** Hull length along Z (world units). */
  length: number;
  /** Hull beam along X. */
  beam: number;
  /** Max hull tilt from vertical, radians (per-class clamp, per plan). */
  maxTilt: number;
  /** Multiplier on the sampled bob height (big ships ride steadier). */
  bobScale: number;
}

export const SHIP_SPECS: Record<PieceType, ShipSpec> = {
  p: { length: 0.42, beam: 0.16, maxTilt: (4 * Math.PI) / 180, bobScale: 1.0 },
  n: { length: 0.6, beam: 0.14, maxTilt: (3.5 * Math.PI) / 180, bobScale: 0.9 },
  b: { length: 0.68, beam: 0.18, maxTilt: (3 * Math.PI) / 180, bobScale: 0.8 },
  r: { length: 0.72, beam: 0.28, maxTilt: (2 * Math.PI) / 180, bobScale: 0.6 },
  q: { length: 0.78, beam: 0.34, maxTilt: (1.5 * Math.PI) / 180, bobScale: 0.5 },
  k: { length: 0.7, beam: 0.24, maxTilt: (2 * Math.PI) / 180, bobScale: 0.7 },
};

function patrolBoat(m: FleetMaterials): THREE.Group {
  const s = SHIP_SPECS.p;
  const g = new THREE.Group();
  g.add(hull(s.length, s.beam, 0.07, m.hull));
  g.add(block(s.beam * 0.6, 0.06, s.length * 0.28, m.deck, 0, 0.035, 0.02));
  g.add(block(0.02, 0.07, 0.02, m.dark, 0, 0.095, 0.02));
  return g;
}

function submarine(m: FleetMaterials): THREE.Group {
  const s = SHIP_SPECS.n;
  const g = new THREE.Group();
  // Cigar hull riding low: capsule along Z, mostly submerged.
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(s.beam / 2, s.length - s.beam, 4, 8),
    m.hull,
  );
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.015;
  g.add(body);
  // Conning sail + periscope.
  g.add(block(0.06, 0.11, 0.14, m.deck, 0, 0.04, -0.02));
  g.add(cylinder(0.008, 0.08, m.dark, 0, 0.15, -0.05, 6));
  // Bow dive planes.
  const plane = block(s.beam * 1.7, 0.012, 0.05, m.dark, 0, 0.01, -s.length * 0.32);
  g.add(plane);
  return g;
}

function frigate(m: FleetMaterials): THREE.Group {
  const s = SHIP_SPECS.b;
  const g = new THREE.Group();
  g.add(hull(s.length, s.beam, 0.08, m.hull));
  g.add(block(s.beam * 0.75, 0.09, s.length * 0.32, m.deck, 0, 0.045, 0.06));
  g.add(block(s.beam * 0.5, 0.07, s.length * 0.14, m.deck, 0, 0.135, 0.03));
  g.add(turret(0.045, m.dark, m.accent, 0, 0.045, -s.length * 0.3));
  g.add(mast(0.2, m.dark, 0, 0.2, 0.05));
  return g;
}

function battleship(m: FleetMaterials): THREE.Group {
  const s = SHIP_SPECS.r;
  const g = new THREE.Group();
  g.add(hull(s.length, s.beam, 0.1, m.hull));
  g.add(block(s.beam * 0.8, 0.1, s.length * 0.42, m.deck, 0, 0.055, 0.05));
  g.add(block(s.beam * 0.5, 0.1, s.length * 0.18, m.deck, 0, 0.155, 0.05));
  g.add(turret(0.07, m.dark, m.accent, 0, 0.055, -s.length * 0.3));
  g.add(turret(0.07, m.dark, m.accent, 0, 0.055, s.length * 0.34));
  g.add(cylinder(0.035, 0.12, m.dark, 0, 0.15, 0.14, 8));
  g.add(cylinder(0.035, 0.12, m.dark, 0, 0.15, 0.24, 8));
  return g;
}

function carrier(m: FleetMaterials): THREE.Group {
  const s = SHIP_SPECS.q;
  const g = new THREE.Group();
  g.add(hull(s.length * 0.92, s.beam * 0.7, 0.09, m.hull));
  // Flight deck: the widest slab in the fleet.
  const deck = block(s.beam, 0.03, s.length, m.deck, 0, 0.09, 0);
  g.add(deck);
  // Runway stripe.
  g.add(block(s.beam * 0.12, 0.032, s.length * 0.9, m.accent, 0, 0.091, 0));
  // Island offset to starboard.
  g.add(block(0.07, 0.14, 0.16, m.hull, s.beam * 0.32, 0.12, 0.08));
  g.add(mast(0.12, m.dark, s.beam * 0.32, 0.26, 0.08));
  return g;
}

function flagship(m: FleetMaterials): THREE.Group {
  const s = SHIP_SPECS.k;
  const g = new THREE.Group();
  g.add(hull(s.length, s.beam, 0.09, m.hull));
  g.add(block(s.beam * 0.8, 0.1, s.length * 0.36, m.deck, 0, 0.05, 0.06));
  // Stepped command tower — the tallest structure in the fleet.
  g.add(block(s.beam * 0.55, 0.11, s.length * 0.2, m.deck, 0, 0.15, 0.04));
  g.add(block(s.beam * 0.35, 0.09, s.length * 0.12, m.hull, 0, 0.26, 0.03));
  g.add(turret(0.05, m.dark, m.accent, 0, 0.05, -s.length * 0.32));
  // Signal mast with the check light.
  g.add(mast(0.24, m.dark, 0, 0.35, 0.03, m.signal));
  return g;
}

const BUILDERS: Record<PieceType, (m: FleetMaterials) => THREE.Group> = {
  p: patrolBoat,
  n: submarine,
  b: frigate,
  r: battleship,
  q: carrier,
  k: flagship,
};

export function buildShip(type: PieceType, materials: FleetMaterials): THREE.Group {
  const ship = BUILDERS[type](materials);
  ship.name = `ship-${type}`;
  return ship;
}
