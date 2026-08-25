/**
 * Shared shipbuilding vocabulary. All six class builders compose from these
 * primitives so the fleet reads as one navy. Every part is authored with the
 * ship facing -Z (bow toward negative Z), beam along X, waterline at y=0.
 */
import * as THREE from "three";

export interface FleetMaterials {
  hull: THREE.MeshStandardMaterial;
  deck: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  /** Flagship signal light — emissive, flashed red on check (Phase 3). */
  signal: THREE.MeshStandardMaterial;
}

export function makeFleetMaterials(ivory: boolean): FleetMaterials {
  const m = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: 0.85,
      metalness: 0.05,
      ...extra,
    });
  return ivory
    ? {
        hull: m("#e8e2d4"),
        deck: m("#c9bfa8"),
        accent: m("#a8863f", { roughness: 0.5, metalness: 0.4 }),
        dark: m("#6b6455"),
        signal: m("#f5efdd", { emissive: "#f2e9c8", emissiveIntensity: 0.6 }),
      }
    : {
        hull: m("#3a4148"),
        deck: m("#2c3338"),
        accent: m("#2f8f8a", { roughness: 0.5, metalness: 0.3 }),
        dark: m("#1d2226"),
        signal: m("#d8e8e6", { emissive: "#bfe8e2", emissiveIntensity: 0.6 }),
      };
}

const mesh = (g: THREE.BufferGeometry, mat: THREE.Material) => new THREE.Mesh(g, mat);

/** Tapered hull: box mid-body with a wedge bow. length along Z, beam along X. */
export function hull(
  length: number,
  beam: number,
  depth: number,
  mat: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  const bowLen = Math.min(length * 0.3, beam * 1.2);
  const bodyLen = length - bowLen;
  const body = mesh(new THREE.BoxGeometry(beam, depth, bodyLen), mat);
  body.position.set(0, depth / 2 - depth * 0.45, bowLen / 2);
  g.add(body);
  // Wedge bow: a squashed cone lying flat, apex forward.
  const bow = mesh(new THREE.ConeGeometry(beam / 2, bowLen, 4), mat);
  bow.rotation.x = -Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.scale.y = 1;
  bow.scale.z = depth / (beam / 2);
  bow.position.set(0, depth / 2 - depth * 0.45, -(bodyLen / 2) + bowLen / 2 - bowLen / 2);
  bow.position.z = -(length / 2) + bowLen / 2;
  g.add(bow);
  return g;
}

export function block(
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const b = mesh(new THREE.BoxGeometry(w, h, d), mat);
  b.position.set(x, y + h / 2, z);
  return b;
}

export function cylinder(
  r: number,
  h: number,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  radialSegments = 8,
): THREE.Mesh {
  const c = mesh(new THREE.CylinderGeometry(r, r, h, radialSegments), mat);
  c.position.set(x, y + h / 2, z);
  return c;
}

/** Gun turret: rotating drum + barrel pointing forward (-Z). */
export function turret(
  r: number,
  mat: THREE.Material,
  barrelMat: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Group {
  const g = new THREE.Group();
  g.add(cylinder(r, r * 0.9, mat, 0, 0, 0, 8));
  const barrel = mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.16, r * 2.2, 6), barrelMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, r * 0.55, -r * 1.2);
  g.add(barrel);
  g.position.set(x, y, z);
  return g;
}

/** Mast with a small yard; optionally topped by a signal light sphere. */
export function mast(
  h: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  signalMat?: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  g.add(cylinder(0.012, h, mat, 0, 0, 0, 6));
  const yard = mesh(new THREE.CylinderGeometry(0.008, 0.008, h * 0.4, 6), mat);
  yard.rotation.z = Math.PI / 2;
  yard.position.y = h * 0.75;
  g.add(yard);
  if (signalMat) {
    const light = mesh(new THREE.SphereGeometry(0.028, 8, 6), signalMat);
    light.position.y = h + 0.02;
    light.name = "signalLight";
    g.add(light);
  }
  g.position.set(x, y, z);
  return g;
}
