import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { Highlights } from "./Highlights";

const quadCount = (scene: THREE.Scene) => scene.children.length;

describe("Highlights lifecycle", () => {
  it("selection + legal quads appear, are replaced, and pool-reuse on clear", () => {
    const scene = new THREE.Scene();
    const h = new Highlights(scene);
    h.setSelection("e2", ["e3", "e4"]);
    expect(quadCount(scene)).toBe(3);
    const firstMeshes = [...scene.children];
    h.setSelection("d2", ["d3", "d4"]);
    expect(quadCount(scene)).toBe(3);
    // Pool reuse: same mesh objects, not new allocations.
    for (const m of scene.children) expect(firstMeshes).toContain(m);
    h.setSelection(null, []);
    expect(quadCount(scene)).toBe(0);
  });

  it("denial flash fades and expires after ~0.6s", () => {
    const scene = new THREE.Scene();
    const h = new Highlights(scene);
    h.flashDenial("g7");
    h.update(0, 0);
    expect(quadCount(scene)).toBe(1);
    h.update(0.3, 0.3);
    expect(quadCount(scene)).toBe(1); // mid-fade, still visible
    h.update(0.7, 0.4);
    expect(quadCount(scene)).toBe(0); // expired and cleared
    // A fresh flash restarts at full opacity.
    h.flashDenial("g7");
    h.update(0, 0.016);
    expect(quadCount(scene)).toBe(1);
  });

  it("quads ride the water surface (positions update with time)", () => {
    const scene = new THREE.Scene();
    const h = new Highlights(scene);
    h.setSelection("e4", []);
    h.update(1, 0.016);
    const y1 = scene.children[0].position.y;
    h.update(30, 0.016);
    const y2 = scene.children[0].position.y;
    expect(y1).not.toBe(y2);
  });
});
