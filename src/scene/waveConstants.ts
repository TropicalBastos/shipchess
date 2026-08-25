/**
 * Single source of truth for the wave field and board geometry.
 * The GLSL used by Ocean.ts is GENERATED from these values (see wavesGlsl),
 * and WaveField.ts evaluates the identical math on the CPU — one definition,
 * two consumers. Ships/buoys anchor at REST positions and are advected by the
 * same forward map (parameter-space anchoring; no inverse solve).
 */

export const GRAVITY = 9.81;

/** Both CPU and GPU consume the same wrapped, float32-rounded time value. */
export const TIME_WRAP = 512;

// Board geometry (world units). 8×8 squares centered on the origin.
export const SQUARE_SIZE = 1.0;
export const BOARD_HALF = 4.0;
/** Ring outside the board over which full wave amplitude returns. Wide
 * enough that the coordinate labels and corner buoys (~0.35–0.55 outside
 * the board) sit in mostly-calm water. */
export const CALM_FALLOFF = 2.5;
/** Fractional amplitude reduction inside the board (calm lagoon). */
export const CALM_DAMPING = 0.96;

export interface WaveSpec {
  dirX: number;
  dirZ: number;
  amplitude: number;
  wavelength: number;
}

/** One long swell + three chop terms. Directions are normalized in derivation. */
export const RAW_WAVES: WaveSpec[] = [
  { dirX: 1.0, dirZ: 0.25, amplitude: 0.055, wavelength: 14.0 },
  { dirX: 0.7, dirZ: -0.6, amplitude: 0.018, wavelength: 5.3 },
  { dirX: -0.3, dirZ: 0.85, amplitude: 0.011, wavelength: 3.1 },
  { dirX: 0.55, dirZ: 0.75, amplitude: 0.006, wavelength: 2.1 },
];

/** Total steepness ΣQᵢAᵢkᵢ. MUST stay ≤ 1 or the surface self-intersects.
 * Kept well below the cap: high steepness also means strong horizontal
 * advection, which read as ships surging around like toys. */
export const STEEPNESS = 0.32;

export interface Wave {
  dirX: number;
  dirZ: number;
  amplitude: number;
  k: number;
  omega: number;
  q: number;
}

const fr = Math.fround;

/**
 * Derived, float32-rounded so CPU math matches the GLSL literals bit-closely.
 * omega is quantized to an integer multiple of 2π/TIME_WRAP so the whole field
 * is EXACTLY periodic over the wrap — the wrap boundary is seamless by
 * construction (shift from true dispersion ≤ ~0.6%, imperceptible).
 */
export const WAVES: Wave[] = RAW_WAVES.map((w) => {
  const len = Math.hypot(w.dirX, w.dirZ);
  const k = (2 * Math.PI) / w.wavelength;
  const q = STEEPNESS / (k * w.amplitude * RAW_WAVES.length);
  const omegaQuantum = (2 * Math.PI) / TIME_WRAP;
  const omega = Math.round(Math.sqrt(GRAVITY * k) / omegaQuantum) * omegaQuantum;
  return {
    dirX: fr(w.dirX / len),
    dirZ: fr(w.dirZ / len),
    amplitude: fr(w.amplitude),
    k: fr(k),
    omega: fr(omega),
    q: fr(q),
  };
});

export const SHORTEST_WAVELENGTH = Math.min(
  ...RAW_WAVES.map((w) => w.wavelength),
);
export const MIN_VERTS_PER_WAVELENGTH = 16;

// Render-scale config values (quality knobs from day one — see plan risk table).
export const OCEAN_SIZE = 90;
export const OCEAN_SEGMENTS = Math.ceil(
  (OCEAN_SIZE * MIN_VERTS_PER_WAVELENGTH) / SHORTEST_WAVELENGTH,
);

const f = (n: number) => {
  const s = String(n);
  return s.includes(".") || s.includes("e") ? s : s + ".0";
};

/**
 * GLSL functions implementing the identical forward map. Unrolled per wave
 * (no arrays) for GLSL ES 1.0 compatibility. `calmFactor` and `waveDisplace`
 * mirror WaveField.ts exactly — including the smoothstep formulation.
 */
export function wavesGlsl(): string {
  let body = "";
  for (const w of WAVES) {
    body += `
  {
    vec2 D = vec2(${f(w.dirX)}, ${f(w.dirZ)});
    float A = ${f(w.amplitude)} * a;
    float phase = ${f(w.k)} * dot(D, rest) - ${f(w.omega)} * t;
    float c = cos(phase);
    float s = sin(phase);
    disp.x += ${f(w.q)} * A * D.x * c;
    disp.z += ${f(w.q)} * A * D.y * c;
    disp.y += A * s;
    n.x -= D.x * ${f(w.k)} * A * c;
    n.z -= D.y * ${f(w.k)} * A * c;
    n.y -= ${f(w.q)} * ${f(w.k)} * A * s;
  }`;
  }
  return `
float calmFactor(vec2 rest) {
  float d = max(abs(rest.x), abs(rest.y));
  float m = 1.0 - smoothstep(${f(BOARD_HALF)}, ${f(BOARD_HALF + CALM_FALLOFF)}, d);
  return 1.0 - ${f(CALM_DAMPING)} * m;
}

vec3 waveDisplace(vec2 rest, float t, out vec3 outNormal) {
  float a = calmFactor(rest);
  vec3 disp = vec3(0.0);
  vec3 n = vec3(0.0, 1.0, 0.0);
${body}
  outNormal = normalize(n);
  return disp;
}
`;
}
