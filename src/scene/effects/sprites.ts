/**
 * Tiny billboard effects: splash foam, wake puffs, muzzle flash. All share a
 * pooled sprite set and one radial texture; headless-safe (no document → no
 * texture, invisible but functional). Driven by the shared Animator.
 */
import * as THREE from "three";
import type { Animator } from "../../animation/Animator";
import { easeOut } from "../../animation/Animator";
import { displace } from "../WaveField";

let texture: THREE.CanvasTexture | null | undefined;
function getTexture(): THREE.CanvasTexture | null {
  if (texture === undefined) {
    if (typeof document === "undefined") {
      texture = null;
    } else {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const ctx = c.getContext("2d")!;
      const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.6, "rgba(230,244,246,0.5)");
      g.addColorStop(1, "rgba(230,244,246,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      texture = new THREE.CanvasTexture(c);
    }
  }
  return texture;
}

export class Effects {
  private readonly scene: THREE.Scene;
  private readonly animator: Animator;
  private readonly pool: THREE.Sprite[] = [];

  constructor(scene: THREE.Scene, animator: Animator) {
    this.scene = scene;
    this.animator = animator;
  }

  private acquire(color: string): THREE.Sprite {
    const s =
      this.pool.pop() ??
      new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: getTexture(),
          transparent: true,
          depthWrite: false,
        }),
      );
    (s.material as THREE.SpriteMaterial).color.set(color);
    this.scene.add(s);
    return s;
  }

  private release(s: THREE.Sprite): void {
    this.scene.remove(s);
    this.pool.push(s);
  }

  /** Expanding, fading foam burst on the water surface at rest (x, z). */
  splash(restX: number, restZ: number, t: number, scale = 1): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (let i = 0; i < 3; i++) {
      const s = this.acquire("#eef6f6");
      const surf = displace(restX, restZ, t);
      const dx = (i - 1) * 0.08 * scale;
      const dz = ((i * 7) % 3 - 1) * 0.08 * scale;
      s.position.set(surf.x + dx, surf.y + 0.03, surf.z + dz);
      const mat = s.material as THREE.SpriteMaterial;
      jobs.push(
        this.animator
          .tween(0.5 + i * 0.1, (v) => {
            s.scale.setScalar((0.1 + v * 0.5) * scale);
            mat.opacity = 1 - v;
          }, easeOut)
          .then(() => this.release(s)),
      );
    }
    return Promise.all(jobs).then(() => {});
  }

  /** Brief warm flash (cannon muzzle) at a world position. */
  flash(x: number, y: number, z: number): Promise<void> {
    const s = this.acquire("#ffd27a");
    s.position.set(x, y, z);
    const mat = s.material as THREE.SpriteMaterial;
    return this.animator
      .tween(0.16, (v) => {
        s.scale.setScalar(0.15 + v * 0.3);
        mat.opacity = 1 - v;
      }, easeOut)
      .then(() => this.release(s));
  }

  /** Small foam puff used for wakes and the submarine's surface disturbance. */
  puff(restX: number, restZ: number, t: number, scale = 0.5): void {
    const s = this.acquire("#dfeef0");
    const surf = displace(restX, restZ, t);
    s.position.set(surf.x, surf.y + 0.02, surf.z);
    const mat = s.material as THREE.SpriteMaterial;
    void this.animator
      .tween(0.6, (v) => {
        s.scale.setScalar((0.08 + v * 0.25) * scale);
        mat.opacity = 0.7 * (1 - v);
      }, easeOut)
      .then(() => this.release(s));
  }
}
