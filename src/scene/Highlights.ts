/**
 * Square highlight quads: selection (brass), legal destinations (sea-glass),
 * and a fading denial flash (signal red). Quads ride the (calm) board water
 * via the shared wave forward map so they never detach from the surface.
 */
import * as THREE from "three";
import { squareToWorld } from "./Fleet";
import { displace } from "./WaveField";

const QUAD = new THREE.PlaneGeometry(0.92, 0.92);

function makeMat(color: string, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
}

class QuadPool {
  private pool: THREE.Mesh[] = [];
  private active: Array<{ mesh: THREE.Mesh; restX: number; restZ: number }> = [];

  private readonly scene: THREE.Scene;
  private readonly material: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene, material: THREE.MeshBasicMaterial) {
    this.scene = scene;
    this.material = material;
  }

  show(squares: string[]): void {
    this.clear();
    for (const sq of squares) {
      const mesh =
        this.pool.pop() ??
        (() => {
          const m = new THREE.Mesh(QUAD, this.material);
          m.rotation.x = -Math.PI / 2;
          return m;
        })();
      const { x, z } = squareToWorld(sq);
      this.scene.add(mesh);
      this.active.push({ mesh, restX: x, restZ: z });
    }
  }

  clear(): void {
    for (const a of this.active) {
      this.scene.remove(a.mesh);
      this.pool.push(a.mesh);
    }
    this.active = [];
  }

  update(t: number): void {
    for (const a of this.active) {
      const s = displace(a.restX, a.restZ, t);
      a.mesh.position.set(s.x, s.y + 0.02, s.z);
    }
  }
}

export class Highlights {
  private readonly selection: QuadPool;
  private readonly legal: QuadPool;
  private readonly denial: QuadPool;
  private readonly denialMat: THREE.MeshBasicMaterial;
  private denialAge = Infinity;

  constructor(scene: THREE.Scene) {
    this.selection = new QuadPool(scene, makeMat("#d9b45c", 0.5));
    this.legal = new QuadPool(scene, makeMat("#9fe8d8", 0.35));
    this.denialMat = makeMat("#e0523c", 0.6);
    this.denial = new QuadPool(scene, this.denialMat);
  }

  setSelection(square: string | null, legalDestinations: string[]): void {
    this.selection.show(square ? [square] : []);
    this.legal.show(legalDestinations);
  }

  flashDenial(square: string): void {
    this.denial.show([square]);
    this.denialAge = 0;
  }

  update(t: number, dt: number): void {
    this.selection.update(t);
    this.legal.update(t);
    this.denial.update(t);
    if (this.denialAge < 0.6) {
      this.denialAge += dt;
      this.denialMat.opacity = 0.6 * Math.max(0, 1 - this.denialAge / 0.6);
      if (this.denialAge >= 0.6) this.denial.clear();
    }
  }
}
