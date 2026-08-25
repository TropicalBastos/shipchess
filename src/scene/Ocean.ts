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
uniform vec3 uLightSquare;
uniform vec3 uDarkSquare;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
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

  // 8×8 checker + grid lines, only inside the board.
  vec2 cell = floor(vRest + ${BOARD_HALF.toFixed(1)});
  float checker = mod(cell.x + cell.y, 2.0);
  vec3 squares = mix(uDarkSquare, uLightSquare, checker);
  vec2 g = abs(fract(vRest + 0.5) - 0.5);
  float line = 1.0 - smoothstep(0.015, 0.05, min(g.x, g.y));
  squares = mix(squares, squares * 0.55, line);
  water = mix(water, squares, board * 0.65);

  // Stylized fresnel, clamped and damped over the board so squares stay legible.
  float fres = pow(1.0 - max(dot(n, view), 0.0), 3.0);
  fres = min(fres, 0.55) * (1.0 - 0.85 * board);
  water = mix(water, uSkyColor, fres);

  // Sun specular: tight glints + a broad sheen, damped over the board.
  vec3 halfDir = normalize(uSunDir + view);
  float ndh = max(dot(n, halfDir), 0.0);
  float spec = pow(ndh, 60.0) * 1.1 + pow(ndh, 8.0) * 0.08;
  water += vec3(1.0, 0.95, 0.82) * spec * (1.0 - 0.9 * board);

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

  constructor(sunDir: THREE.Vector3) {
    const geo = new THREE.PlaneGeometry(
      OCEAN_SIZE,
      OCEAN_SIZE,
      OCEAN_SEGMENTS,
      OCEAN_SEGMENTS,
    );
    geo.rotateX(-Math.PI / 2); // position attribute now spans XZ, y = 0

    this.uniforms = {
      uTime: { value: 0 },
      uSunDir: { value: sunDir.clone().normalize() },
      uDeepColor: { value: new THREE.Color("#0a3450") },
      uCrestColor: { value: new THREE.Color("#2b7d95") },
      uSkyColor: { value: new THREE.Color("#e9ece4") },
      uLightSquare: { value: new THREE.Color("#aac9c0") },
      uDarkSquare: { value: new THREE.Color("#26505c") },
      uFogColor: { value: new THREE.Color("#e5e9df") },
      uFogNear: { value: 55 },
      uFogFar: { value: 160 },
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
}
