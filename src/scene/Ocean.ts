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
varying vec2 vRest;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vHeight;

${wavesGlsl()}

void main() {
  vec3 n = normalize(vNormal);
  vec3 view = normalize(cameraPosition - vWorldPos);

  // Depth tint: crest-lightened water color.
  float lift = clamp(vHeight * 1.6 + 0.5, 0.0, 1.0);
  vec3 water = mix(uDeepColor, uCrestColor, lift);

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

  // Sun specular, damped over the board.
  vec3 halfDir = normalize(uSunDir + view);
  float spec = pow(max(dot(n, halfDir), 0.0), 90.0) * (1.0 - 0.9 * board);
  water += vec3(1.0, 0.95, 0.85) * spec * 0.6;

  // Simple lambert so swells read as form.
  float diff = 0.75 + 0.25 * max(dot(n, uSunDir), 0.0);
  gl_FragColor = vec4(water * diff, 1.0);
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
      uDeepColor: { value: new THREE.Color("#0d3a4d") },
      uCrestColor: { value: new THREE.Color("#2e7d92") },
      uSkyColor: { value: new THREE.Color("#cfe0e8") },
      uLightSquare: { value: new THREE.Color("#9fc4c9") },
      uDarkSquare: { value: new THREE.Color("#39616e") },
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
