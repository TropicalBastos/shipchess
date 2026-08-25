/**
 * CPU side of the wave forward map. Identical math to the generated GLSL in
 * waveConstants.wavesGlsl(). Consumers (ships, buoys, debug cube) anchor at a
 * REST position (x0, z0) and are placed at displace(x0, z0, t) — the exact
 * surface point the mesh vertex with that rest position renders at.
 */
import {
  BOARD_HALF,
  CALM_DAMPING,
  CALM_FALLOFF,
  TIME_WRAP,
  WAVES,
} from "./waveConstants";

export interface SurfaceSample {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
}

/** Wrap and float32-round elapsed seconds; the same value is uploaded as uTime. */
export function wrapTime(elapsedSeconds: number): number {
  return Math.fround(elapsedSeconds % TIME_WRAP);
}

/** GLSL-identical smoothstep. */
function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Amplitude factor: ~1 in open water, 1 - CALM_DAMPING inside the board. */
export function calmFactor(x0: number, z0: number): number {
  const d = Math.max(Math.abs(x0), Math.abs(z0));
  const m = 1 - smoothstep(BOARD_HALF, BOARD_HALF + CALM_FALLOFF, d);
  return 1 - CALM_DAMPING * m;
}

/** Forward Gerstner map: rest position + wrapped time → surface point + normal. */
export function displace(x0: number, z0: number, t: number): SurfaceSample {
  const a = calmFactor(x0, z0);
  let dx = 0;
  let dy = 0;
  let dz = 0;
  let nx = 0;
  let ny = 1;
  let nz = 0;
  for (const w of WAVES) {
    const A = w.amplitude * a;
    const phase = w.k * (w.dirX * x0 + w.dirZ * z0) - w.omega * t;
    const c = Math.cos(phase);
    const s = Math.sin(phase);
    dx += w.q * A * w.dirX * c;
    dz += w.q * A * w.dirZ * c;
    dy += A * s;
    nx -= w.dirX * w.k * A * c;
    nz -= w.dirZ * w.k * A * c;
    ny -= w.q * w.k * A * s;
  }
  const len = Math.hypot(nx, ny, nz);
  return {
    x: x0 + dx,
    y: dy,
    z: z0 + dz,
    nx: nx / len,
    ny: ny / len,
    nz: nz / len,
  };
}
