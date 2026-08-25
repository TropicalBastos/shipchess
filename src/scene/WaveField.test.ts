import { describe, expect, it } from "vitest";
import { calmFactor, displace, wrapTime } from "./WaveField";
import {
  BOARD_HALF,
  CALM_DAMPING,
  CALM_FALLOFF,
  GRAVITY,
  RAW_WAVES,
  STEEPNESS,
  TIME_WRAP,
  WAVES,
  wavesGlsl,
} from "./waveConstants";

/** Independent re-derivation of the forward map straight from RAW_WAVES. */
function reference(x0: number, z0: number, t: number) {
  const d = Math.max(Math.abs(x0), Math.abs(z0));
  const tt = Math.min(
    1,
    Math.max(0, (d - BOARD_HALF) / (BOARD_HALF + CALM_FALLOFF - BOARD_HALF)),
  );
  const a = 1 - CALM_DAMPING * (1 - tt * tt * (3 - 2 * tt));
  let dx = 0,
    dy = 0,
    dz = 0;
  for (const w of RAW_WAVES) {
    const len = Math.hypot(w.dirX, w.dirZ);
    const dirX = w.dirX / len,
      dirZ = w.dirZ / len;
    const k = (2 * Math.PI) / w.wavelength;
    // Spec: omega is quantized to a multiple of 2π/TIME_WRAP (seamless wrap).
    const quantum = (2 * Math.PI) / TIME_WRAP;
    const omega = Math.round(Math.sqrt(GRAVITY * k) / quantum) * quantum;
    const q = STEEPNESS / (k * w.amplitude * RAW_WAVES.length);
    const A = w.amplitude * a;
    const phase = k * (dirX * x0 + dirZ * z0) - omega * t;
    dx += q * A * dirX * Math.cos(phase);
    dz += q * A * dirZ * Math.cos(phase);
    dy += A * Math.sin(phase);
  }
  return { x: x0 + dx, y: dy, z: z0 + dz };
}

const SAMPLES: Array<[number, number, number]> = [
  [0, 0, 0],
  [6.3, -8.7, 3.25],
  [-12.1, 5.4, 100.5],
  [3.9, 4.1, 511.9], // straddles the calm falloff ring, near time wrap
  [40, -40, 250.0],
];

describe("WaveField ↔ analytic parity", () => {
  it("matches an independent derivation within float32 tolerance", () => {
    for (const [x, z, t] of SAMPLES) {
      const got = displace(x, z, wrapTime(t));
      const want = reference(x, z, wrapTime(t));
      // Constants are float32-rounded on the WaveField side; allow that noise.
      expect(Math.abs(got.x - want.x)).toBeLessThan(1e-4);
      expect(Math.abs(got.y - want.y)).toBeLessThan(1e-4);
      expect(Math.abs(got.z - want.z)).toBeLessThan(1e-4);
    }
  });

  it("respects the non-folding steepness cap ΣQᵢAᵢkᵢ ≤ 1", () => {
    const total = WAVES.reduce((s, w) => s + w.q * w.amplitude * w.k, 0);
    expect(total).toBeCloseTo(STEEPNESS, 5);
    expect(total).toBeLessThanOrEqual(1);
  });

  it("returns unit normals everywhere", () => {
    for (const [x, z, t] of SAMPLES) {
      const s = displace(x, z, wrapTime(t));
      expect(Math.hypot(s.nx, s.ny, s.nz)).toBeCloseTo(1, 6);
      expect(s.ny).toBeGreaterThan(0); // never a folded/inverted surface
    }
  });

  it("calms the board region and leaves open water untouched", () => {
    expect(calmFactor(0, 0)).toBeCloseTo(1 - CALM_DAMPING, 6);
    expect(calmFactor(3.9, 0)).toBeCloseTo(1 - CALM_DAMPING, 6);
    expect(calmFactor(BOARD_HALF + CALM_FALLOFF + 0.01, 0)).toBeCloseTo(1, 6);
    // board-center wave height is a small fraction of open-water height
    let boardMax = 0;
    let seaMax = 0;
    for (let t = 0; t < 20; t += 0.25) {
      boardMax = Math.max(boardMax, Math.abs(displace(1.3, -0.7, t).y));
      seaMax = Math.max(seaMax, Math.abs(displace(21.3, -20.7, t).y));
    }
    expect(boardMax).toBeLessThan(seaMax * 0.35);
  });

  it("bounds horizontal advection by ΣQᵢAᵢ (ships stay near their square)", () => {
    const bound = WAVES.reduce((s, w) => s + w.q * w.amplitude, 0) + 1e-6;
    for (let t = 0; t < TIME_WRAP; t += 7.3) {
      const s = displace(10.5, 10.5, wrapTime(t));
      expect(Math.hypot(s.x - 10.5, s.z - 10.5)).toBeLessThanOrEqual(bound);
    }
  });

  it("is seamless across the time wrap (omega quantized to the wrap period)", () => {
    // The wrapped and unwrapped clocks must produce the same surface: any
    // difference is pure wrap discontinuity, isolated from real wave motion.
    for (const [x, z] of [
      [6, 3],
      [45, 45],
      [-20, 12],
    ]) {
      for (const t of [TIME_WRAP + 0.25, 3 * TIME_WRAP + 17.3]) {
        const wrapped = displace(x, z, wrapTime(t));
        const unwrapped = displace(x, z, Math.fround(t));
        expect(Math.abs(wrapped.y - unwrapped.y)).toBeLessThan(1e-3);
        expect(
          Math.hypot(wrapped.x - unwrapped.x, wrapped.z - unwrapped.z),
        ).toBeLessThan(1e-3);
      }
    }
    expect(wrapTime(TIME_WRAP)).toBe(0);
    expect(wrapTime(TIME_WRAP + 0.1)).toBeCloseTo(Math.fround(0.1), 7);
  });

  it("generates GLSL carrying every derived constant of every wave", () => {
    const glsl = wavesGlsl();
    expect(glsl).toContain("calmFactor");
    expect(glsl).toContain("waveDisplace");
    for (const w of WAVES) {
      for (const v of [w.dirX, w.dirZ, w.amplitude, w.k, w.omega, w.q]) {
        const s = String(v);
        expect(glsl).toContain(s.includes(".") ? s : s + ".0");
      }
    }
  });
});
