import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PickController } from "./PickController";

type Handler = (e: {
  clientX: number;
  clientY: number;
}) => void;

/** Minimal canvas stand-in: listener registry + a fixed bounding rect. */
function fakeCanvas() {
  const handlers: Record<string, Handler[]> = {};
  return {
    style: {} as CSSStyleDeclaration,
    addEventListener: (type: string, fn: Handler) => {
      (handlers[type] ??= []).push(fn);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    fire: (type: string, x: number, y: number) => {
      for (const fn of handlers[type] ?? []) fn({ clientX: x, clientY: y });
    },
  };
}

function makeSetup() {
  const canvas = fakeCanvas();
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100);
  camera.position.set(0, 10, 0.001); // near top-down: screen center ≈ board center
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const clicks: Array<string | null> = [];
  new PickController(
    canvas as unknown as HTMLCanvasElement,
    camera,
    (sq) => clicks.push(sq),
  );
  return { canvas, clicks };
}

describe("PickController", () => {
  it("a clean click resolves to a board square", () => {
    const { canvas, clicks } = makeSetup();
    canvas.fire("pointerdown", 400, 300);
    canvas.fire("pointerup", 400, 300);
    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toMatch(/^[a-h][1-8]$/);
  });

  it("an endpoint drag beyond the slop is not a click", () => {
    const { canvas, clicks } = makeSetup();
    canvas.fire("pointerdown", 400, 300);
    canvas.fire("pointerup", 460, 300);
    expect(clicks).toHaveLength(0);
  });

  it("an orbit drag returning to its origin is NOT a click (peak displacement)", () => {
    const { canvas, clicks } = makeSetup();
    canvas.fire("pointerdown", 400, 300);
    canvas.fire("pointermove", 520, 340); // big excursion
    canvas.fire("pointermove", 402, 301); // back near origin
    canvas.fire("pointerup", 401, 300);
    expect(clicks).toHaveLength(0);
  });

  it("clicks outside the board report null", () => {
    const { canvas, clicks } = makeSetup();
    canvas.fire("pointerdown", 790, 20); // far corner → off-board water
    canvas.fire("pointerup", 790, 20);
    expect(clicks).toEqual([null]);
  });
});
