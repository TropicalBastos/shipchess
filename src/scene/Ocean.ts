/**
 * The sea. Opaque by design (see plan: no transparency/refraction/scene-depth,
 * no shadow maps, no post-processing). Vertex shader runs the generated wave
 * forward map; fragment draws depth tint, clamped stylized fresnel, sun
 * specular, and the 8×8 board (checker + grid lines) from REST coordinates so
 * board pattern and parameter-anchored ships advect together, coherently.
 */
import * as THREE from "three";
import {
  BOARD_HALF,
  OCEAN_SEGMENTS,
  OCEAN_FAR_HALF,
  OCEAN_SIZE,
  wavesGlsl,
} from "./waveConstants";

const VERT = /* glsl */ `
uniform float uTime;
varying vec2 vRest;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vHeight;

${wavesGlsl()}

void main() {
  vec2 rest = position.xz;
  vRest = rest;
  vec3 n;
  vec3 disp = waveDisplace(rest, uTime, n);
  vec3 displaced = vec3(rest.x, 0.0, rest.y) + disp;
  vNormal = n;
  vHeight = disp.y;
  vec4 world = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uDeepColor;
uniform vec3 uCrestColor;
uniform vec3 uSkyColor;
uniform vec3 uGridColor;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uBoardLight;
varying vec2 vRest;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vHeight;

${wavesGlsl()}

void main() {
  vec3 n = normalize(vNormal);
  vec3 view = normalize(cameraPosition - vWorldPos);

  // Depth tint: crest-lightened water color.
  float lift = clamp(vHeight * 1.8 + 0.5, 0.0, 1.0);
  vec3 water = mix(uDeepColor, uCrestColor, lift);

  // Whitecap hint on only the steepest crests so the swell reads as form.
  float steep = 1.0 - n.y;
  float cap = smoothstep(0.24, 0.4, steep) * smoothstep(0.0, 0.12, vHeight);
  water = mix(water, vec3(0.86, 0.93, 0.94), cap * 0.5);

  // Board mask from REST coordinates (1 inside the play area).
  float board = 1.0 - smoothstep(${BOARD_HALF.toFixed(1)}, ${(BOARD_HALF + 0.35).toFixed(2)}, max(abs(vRest.x), abs(vRest.y)));

  // No board colour at all (user direction): the sea renders straight
  // through the play area; only the chart grid marks it.

  // Cartographic, not neon (user direction): thin desaturated lines BLENDED
  // onto the water like a nautical chart overlay — no additive glow, no
  // halos. A touch more presence at night via uBoardLight.
  float pool = 1.0 - smoothstep(2.5, ${(BOARD_HALF + 1.2).toFixed(1)}, length(vRest));
  float lineAlpha = 0.55 + uBoardLight * 0.2 + pool * 0.04;

  // Strategy-map grid: crisp hairlines at near-constant screen width
  // (fwidth-based AA), narrower but more opaque than the old soft bands.
  vec2 g = abs(fract(vRest + 0.5) - 0.5);
  float dLine = min(g.x, g.y);
  float aa = fwidth(dLine);
  float hw = max(0.006, aa * 1.1);
  float line = 1.0 - smoothstep(hw - aa, hw + aa, dLine);
  float dEdge = abs(max(abs(vRest.x), abs(vRest.y)) - ${BOARD_HALF.toFixed(1)});
  float aaE = fwidth(dEdge);
  float hwE = max(0.02, aaE * 1.8); // heavier boundary: map-frame hierarchy
  float frame = 1.0 - smoothstep(hwE - aaE, hwE + aaE, dEdge);
  water = mix(water, uGridColor, line * board * lineAlpha);
  water = mix(water, uGridColor, frame * min(1.0, lineAlpha * 1.5));

  // Stylized fresnel, clamped and damped over the board so squares stay legible.
  float fres = pow(1.0 - max(dot(n, view), 0.0), 3.0);
  fres = min(fres, 0.55) * (1.0 - 0.25 * board);
  water = mix(water, uSkyColor, fres);

  // Sun specular: tight glints + a broad sheen, damped over the board.
  vec3 halfDir = normalize(uSunDir + view);
  float ndh = max(dot(n, halfDir), 0.0);
  float spec = pow(ndh, 60.0) * 1.1 + pow(ndh, 8.0) * 0.08;
  water += vec3(1.0, 0.95, 0.82) * spec * (1.0 - 0.55 * board);

  // Simple lambert so swells read as form.
  float diff = 0.75 + 0.25 * max(dot(n, uSunDir), 0.0);
  water *= diff;

  // Horizon fog matching SceneManager's scene.fog so the far ocean edge
  // dissolves into the sky instead of silhouetting against it.
  float fogF = smoothstep(uFogNear, uFogFar, length(vWorldPos - cameraPosition));
  water = mix(water, uFogColor, fogF);

  gl_FragColor = vec4(water, 1.0);
}
`;

export class Ocean {
  readonly mesh: THREE.Mesh;
  private readonly uniforms: { [k: string]: THREE.IUniform };

  constructor(sunDir: THREE.Vector3, segmentsScale = 1) {
    // Quality tier: low halves the mesh density (config value per the plan's
    // risk table; ≥8 verts/shortest-wavelength holds at scale 1, low trades
    // fidelity knowingly).
    const segs = Math.max(32, Math.round(OCEAN_SEGMENTS * segmentsScale));
    const geo = new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, segs, segs);
    geo.rotateX(-Math.PI / 2); // position attribute now spans XZ, y = 0

    // Horizon stretch: quartic per-axis warp. Cells near the board keep full
    // density (≤2% stretch inside |x| < OCEAN_SIZE/4); the outermost cells
    // reach OCEAN_FAR_HALF so the surface meets the fogged horizon with no
    // visible mesh edge. Waves are undersampled far out, but full fog lands
    // well before sampling breaks down.
    const half = OCEAN_SIZE / 2;
    const stretch = OCEAN_FAR_HALF / half - 1;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setX(i, x * (1 + stretch * (Math.abs(x) / half) ** 4));
      pos.setZ(i, z * (1 + stretch * (Math.abs(z) / half) ** 4));
    }

    this.uniforms = {
      uTime: { value: 0 },
      uSunDir: { value: sunDir.clone().normalize() },
      uDeepColor: { value: new THREE.Color("#0a3450") },
      uCrestColor: { value: new THREE.Color("#2b7d95") },
      uSkyColor: { value: new THREE.Color("#e9ece4") },
      uGridColor: { value: new THREE.Color("#c9dade") },
      uFogColor: { value: new THREE.Color("#e5e9df") },
      uFogNear: { value: 70 },
      uFogFar: { value: 340 },
      uBoardLight: { value: 0.15 },
    };

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; // displaced verts exceed the flat bounds
  }

  /** t must be WaveField.wrapTime(elapsed) — the shared float32 time value. */
  setTime(t: number): void {
    this.uniforms.uTime.value = t;
  }

  /** Spotlight pool brightness on the board (matches SceneManager's spot). */
  setBoardLight(v: number): void {
    this.uniforms.uBoardLight.value = v;
  }

  /** Sun-preset support (Phase 7). */
  setSunDir(dir: THREE.Vector3): void {
    (this.uniforms.uSunDir.value as THREE.Vector3).copy(dir).normalize();
  }

  setPalette(deep: string, crest: string, skyTint: string, fog: string): void {
    (this.uniforms.uDeepColor.value as THREE.Color).set(deep);
    (this.uniforms.uCrestColor.value as THREE.Color).set(crest);
    (this.uniforms.uSkyColor.value as THREE.Color).set(skyTint);
    // Fog matches the HORIZON, not the fresnel sky tint (P7-04 — moonlit's
    // bright tint made the far sea fade pale against a dark horizon).
    (this.uniforms.uFogColor.value as THREE.Color).set(fog);
  }
}
