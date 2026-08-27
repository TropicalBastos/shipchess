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
uniform sampler2D uMapTex;
uniform float uMapTexAmount;
uniform vec3 uMapTint;
uniform float uChecker;
varying vec2 vRest;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vHeight;

${wavesGlsl()}

// Value noise for the strategy-map board shading (same construction as the
// sky shader's cloud noise).
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * vnoise(p);
    p = p * 2.03 + vec2(19.7, 7.3);
    amp *= 0.5;
  }
  return v;
}

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

  // Tier-1 strategy-map board: inside the mask the sea is shaded like an
  // illustrated world map — flat posterized depth bands, faint bathymetry
  // contours, paper grain — while the open ocean keeps realistic shading.
  // The map is drawn in REST space, so it is "printed" on the board and
  // does not slide with the swell; a whisper of wave lift survives so the
  // ships still read as afloat.
  // Strategy-map CHESSBOARD: parity gives proper light/dark squares in the
  // preset palette (boundaries at integer vRest); the Tier-1 posterized
  // depth bands, contours, and grain survive as in-square texture so each
  // square still reads as a piece of printed chart.
  float mapN = fbm(vRest * 0.5 + 7.3);
  float bands = 4.0;
  float band = floor(mapN * bands) / (bands - 1.0);
  float fb = fract(mapN * bands);
  float contour = 1.0 - smoothstep(0.02, 0.09, min(fb, 1.0 - fb));
  float parity = mod(floor(vRest.x) + floor(vRest.y), 2.0);
  vec3 mapCol = mix(uDeepColor * 0.7, mix(uDeepColor, uCrestColor, 0.95), parity);
  mapCol *= 0.84 + 0.26 * band;                      // depth-band texture
  mapCol *= 1.0 - contour * 0.1;                     // bathymetry rings
  mapCol += (vnoise(vRest * 34.0) - 0.5) * 0.035;    // paper grain
  // Provided ocean texture (Tier 2), one tile PER SQUARE: squares are 1
  // rest-unit and the sampler uses hardware mirrored repeat, so adjacent
  // squares flip the image — seamless edges and less visible repetition.
  // Tinted by the preset so it dims/cools at night; the procedural bands
  // above remain the fallback until the texture loads.
  vec2 mapUv = vRest;
  vec3 texCol = texture2D(uMapTex, mapUv).rgb * uMapTint;
  mapCol = mix(mapCol, texCol, uMapTexAmount);
  mapCol *= 0.96 + 0.08 * lift;                      // whisper of swell
  mapCol *= 1.0 + uBoardLight * 0.25;                // night spotlight pool
  // uChecker toggles the whole map treatment: off = open-water chart
  // (sea through the board, grid only — the pre-map look).
  water = mix(water, mapCol, board * uChecker);

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
  // Fully flat on the map; the open-water chart keeps its gentler damping.
  fres = min(fres, 0.55) * (1.0 - board * mix(0.25, 1.0, uChecker));
  water = mix(water, uSkyColor, fres);

  // Sun specular: tight glints + a broad sheen, damped over the board.
  vec3 halfDir = normalize(uSunDir + view);
  float ndh = max(dot(n, halfDir), 0.0);
  float spec = pow(ndh, 60.0) * 1.1 + pow(ndh, 8.0) * 0.08;
  water += vec3(1.0, 0.95, 0.82) * spec * (1.0 - board * mix(0.55, 1.0, uChecker));

  // Simple lambert so swells read as form; mostly flattened on the map.
  float diff = 0.75 + 0.25 * max(dot(n, uSunDir), 0.0);
  water *= mix(diff, 1.0, board * 0.75 * uChecker);

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
      // 1x1 white placeholder so the sampler is always bound; the real
      // board texture arrives via setMapTexture once loaded.
      uMapTex: {
        value: new THREE.DataTexture(
          new Uint8Array([255, 255, 255, 255]),
          1,
          1,
        ),
      },
      uMapTexAmount: { value: 0 },
      uMapTint: { value: new THREE.Color("#ffffff") },
      uChecker: { value: 1 },
    };
    (this.uniforms.uMapTex.value as THREE.DataTexture).needsUpdate = true;

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

  /** Checkered strategy-map board on/off (off = open-water chart). */
  setCheckered(on: boolean): void {
    this.uniforms.uChecker.value = on ? 1 : 0;
  }

  /** Board map texture (Tier 2): stretched once across the play area. */
  setMapTexture(tex: THREE.Texture): void {
    tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
    tex.anisotropy = 8;
    this.uniforms.uMapTex.value = tex;
    this.uniforms.uMapTexAmount.value = 1;
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
    // Board texture tint: ratio of this preset's deep color to the day
    // baseline, so the photo reads neutral by day and dims/cools by night.
    const day = new THREE.Color("#0a3450");
    const d = new THREE.Color(deep);
    (this.uniforms.uMapTint.value as THREE.Color).setRGB(
      Math.min(1.25, d.r / Math.max(day.r, 1e-3)),
      Math.min(1.25, d.g / Math.max(day.g, 1e-3)),
      Math.min(1.25, d.b / Math.max(day.b, 1e-3)),
    );
  }
}
