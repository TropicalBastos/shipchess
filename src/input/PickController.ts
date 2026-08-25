/**
 * Pointer-events picking (trackpad + touch from day one, per the plan).
 * A "click" is pointerdown→pointerup with little movement — anything longer
 * is an orbit drag and stays with OrbitControls. Squares are resolved by
 * intersecting the y=0 board plane and mapping world → square; ships carry
 * their square identity via the Fleet registry, so no mesh raycast is needed.
 */
import * as THREE from "three";
import { worldToSquare } from "../scene/Fleet";

const CLICK_SLOP_PX = 6;

export class PickController {
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hit = new THREE.Vector3();
  private readonly ndc = new THREE.Vector2();
  private down: { x: number; y: number; pointerId: number } | null = null;
  private maxMoved = 0;

  private readonly canvas: HTMLCanvasElement;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly onSquareClick: (square: string | null) => void;

  constructor(
    canvas: HTMLCanvasElement,
    camera: THREE.PerspectiveCamera,
    onSquareClick: (square: string | null) => void,
  ) {
    this.canvas = canvas;
    this.camera = camera;
    this.onSquareClick = onSquareClick;
    canvas.style.touchAction = "none";
    // Pointer identity: real touches carry distinct nonzero ids; mouse and
    // synthetic events may report 0/undefined. Treat those as wildcards so
    // strict id-matching never eats a legitimate click (seen with injected
    // events), while true multi-touch still cancels the gesture (R2-01).
    const samePointer = (a: number | undefined, b: number | undefined) =>
      !a || !b || a === b;
    canvas.addEventListener("pointerdown", (e) => {
      if (this.down && !samePointer(e.pointerId, this.down.pointerId)) {
        this.down = null; // second concurrent pointer: cancel, don't hijack
        return;
      }
      this.down = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      this.maxMoved = 0;
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.down || !samePointer(e.pointerId, this.down.pointerId)) return;
      // Track PEAK displacement: an orbit drag that returns to its origin
      // must never read as a click (Phase 3 review W3-02).
      this.maxMoved = Math.max(
        this.maxMoved,
        Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y),
      );
    });
    canvas.addEventListener("pointercancel", () => {
      this.down = null;
    });
    canvas.addEventListener("pointerup", (e) => {
      if (!this.down) return;
      const moved = Math.max(
        this.maxMoved,
        Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y),
      );
      this.down = null;
      if (moved > CLICK_SLOP_PX) return; // orbit drag, not a click
      this.onSquareClick(this.pick(e.clientX, e.clientY));
    });
  }

  private pick(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const p = this.raycaster.ray.intersectPlane(this.plane, this.hit);
    if (!p) return null;
    return worldToSquare(p.x, p.z);
  }
}
