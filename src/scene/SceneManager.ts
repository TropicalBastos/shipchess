/**
 * Renderer, camera rig, sky, fog, sun. Orbit is clamped above the horizon and
 * zoom-limited per the plan's Phase 1 spec. Also owns the dev FPS overlay.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TIME_WRAP } from "./waveConstants";

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// All sky motion (cloud drift, star twinkle) uses angular rates that are
// integer multiples of 2π/TIME_WRAP, so the shared wrapped time is seamless
// here exactly as it is for the ocean.
const ROT = (2 * Math.PI) / TIME_WRAP; // one sky revolution per wrap
const TWINKLE = ROT * 16;

const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uCloudColor;
uniform float uCloudAmount;
uniform float uStarIntensity;
uniform float uTime;
varying vec3 vDir;

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
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.16, h));

  // Slow whole-sky drift; the sun stays fixed (it drives the scene light).
  float ang = uTime * ${ROT};
  float ca = cos(ang);
  float sa = sin(ang);
  vec3 rd = vec3(d.x * ca - d.z * sa, d.y, d.x * sa + d.z * ca);

  // Stars: hashed grid on a planar projection, twinkling, horizon-faded.
  if (uStarIntensity > 0.001) {
    vec2 sp = rd.xz / (max(rd.y, 0.03) + 0.4) * 28.0;
    vec2 cell = floor(sp);
    float hs = hash21(cell);
    if (hs > 0.68) {
      vec2 star = vec2(hash21(cell + 4.7), hash21(cell + 9.1)) * 0.8 + 0.1;
      float dist = length(fract(sp) - star);
      float tw = 0.75 + 0.25 * sin(uTime * ${TWINKLE} * (1.0 + floor(hs * 6.0)) + hs * 41.0);
      float s = (1.0 - smoothstep(0.0, 0.075, dist)) * tw * (hs - 0.68) * 5.5;
      col += vec3(0.9, 0.95, 1.0) * s * uStarIntensity * smoothstep(0.05, 0.35, d.y);
    }
  }

  // Sun (or moon, by preset color) disc with a two-lobe halo.
  float sd = dot(d, uSunDir);
  float glow = pow(max(sd, 0.0), 160.0) * 0.55 + pow(max(sd, 0.0), 8.0) * 0.13;
  float disc = smoothstep(0.9993, 0.99965, sd);
  col += uSunColor * glow;
  col = mix(col, uSunColor + vec3(0.25), disc);

  // Two FBM cloud layers; the far layer drifts at 2x for parallax.
  float ca2 = ca * ca - sa * sa;
  float sa2 = 2.0 * sa * ca;
  vec3 rd2 = vec3(d.x * ca2 - d.z * sa2, d.y, d.x * sa2 + d.z * ca2);
  // The camera orbit clamps just above the horizon, so the playable sky is a
  // LOW band: clouds must reach the horizon and haze into the fog color there
  // rather than fading out.
  vec2 cuv = rd.xz / (max(rd.y, 0.03) + 0.18);
  vec2 cuv2 = rd2.xz / (max(rd2.y, 0.03) + 0.28);
  float n = max(fbm(cuv * 0.35), fbm(cuv2 * 0.8 + 31.0) * 0.85);
  float t0 = 1.02 - uCloudAmount * 0.75;
  float cloud = smoothstep(t0, t0 + 0.24, n) * smoothstep(0.005, 0.06, d.y);
  // Self-shading: denser cores read dimmer, keeping shape without flatness.
  vec3 ccol = uCloudColor * (1.02 - 0.45 * smoothstep(t0, t0 + 0.45, n));
  ccol = mix(ccol, uHorizon, 1.0 - smoothstep(0.0, 0.1, d.y)); // horizon haze
  col = mix(col, ccol, cloud);
  col += uSunColor * glow * 0.35 * cloud; // halo bleeding through thin cloud

  gl_FragColor = vec4(col, 1.0);
}
`;

export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly sunDir = new THREE.Vector3(0.6, 0.34, 0.42).normalize();
  private sun!: THREE.DirectionalLight;
  private ambientLight!: THREE.AmbientLight;
  private skyMat!: THREE.ShaderMaterial;
  private readonly fpsEl: HTMLDivElement;
  private frames = 0;
  private fpsTimer = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      1200,
    );
    this.camera.position.set(0, 7.5, 11);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.minPolarAngle = 0.15; // never straight overhead-locked
    this.controls.maxPolarAngle = 1.32; // stays above the horizon
    this.controls.minDistance = 6;
    this.controls.maxDistance = 28;
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.renderer.domElement.addEventListener("pointerdown", () => {
      this.glideT = 1; // user takes the camera: cancel any glide (P4-03)
    });

    // Sky dome + matching horizon fog.
    const horizon = new THREE.Color("#e5e9df");
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uZenith: { value: new THREE.Color("#1c4e7e") },
        uHorizon: { value: horizon },
        uSunDir: { value: this.sunDir.clone() },
        uSunColor: { value: new THREE.Color("#fff4e0") },
        uCloudColor: { value: new THREE.Color("#ffffff") },
        uCloudAmount: { value: 0.5 },
        uStarIntensity: { value: 0 },
        uTime: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), this.skyMat);
    this.scene.add(sky);
    this.scene.fog = new THREE.Fog(horizon, 70, 340);

    this.sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    this.sun.position.copy(this.sunDir).multiplyScalar(100);
    this.ambientLight = new THREE.AmbientLight(0xbfd4de, 0.9);
    this.scene.add(this.sun, this.ambientLight);

    this.fpsEl = document.createElement("div");
    this.fpsEl.style.cssText =
      "position:fixed;top:8px;left:8px;color:#fff;background:rgba(0,0,0,.45);" +
      "font:12px monospace;padding:2px 6px;border-radius:3px;z-index:10";
    container.appendChild(this.fpsEl);

    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // Camera glide: swings gently to the active fleet's side each turn,
  // running on its own track (never blocks or extends move animations).
  private glideFrom: number | null = null;
  private glideTo = 0;
  private glideT = 1;

  /** Immediately stop any in-flight camera glide (reduced-motion honesty). */
  cancelGlide(): void {
    this.glideT = 1;
  }

  glideToSide(color: "w" | "b"): void {
    this.glideFrom = Math.atan2(this.camera.position.x, this.camera.position.z);
    this.glideTo = color === "w" ? 0 : Math.PI;
    let d = (this.glideTo - this.glideFrom) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    // Near-zero glides are no-ops; and the USER always outranks the glide —
    // a pointerdown mid-glide cancels it (review P4-03).
    this.glideT = Math.abs(d) < 0.02 ? 1 : 0;
  }

  private updateGlide(dt: number): void {
    if (this.glideFrom === null || this.glideT >= 1) return;
    this.glideT = Math.min(1, this.glideT + dt / 1.1);
    const v = this.glideT * this.glideT * (3 - 2 * this.glideT);
    let d = (this.glideTo - this.glideFrom) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    const az = this.glideFrom + d * v;
    const r = Math.hypot(this.camera.position.x, this.camera.position.z);
    this.camera.position.set(Math.sin(az) * r, this.camera.position.y, Math.cos(az) * r);
    this.camera.lookAt(0, 0, 0);
  }

  /** Apply a sun preset's lighting/sky half (the ocean applies its own). */
  applyPreset(p: {
    sunDir: [number, number, number];
    sunColor: string;
    sunIntensity: number;
    ambient: string;
    ambientIntensity: number;
    zenith: string;
    horizon: string;
    cloudColor: string;
    cloudAmount: number;
    starIntensity: number;
  }): void {
    this.sunDir.set(...p.sunDir).normalize();
    this.sun.position.copy(this.sunDir).multiplyScalar(100);
    this.sun.color.set(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    this.ambientLight.color.set(p.ambient);
    this.ambientLight.intensity = p.ambientIntensity;
    const u = this.skyMat.uniforms;
    (u.uZenith.value as THREE.Color).set(p.zenith);
    (u.uHorizon.value as THREE.Color).set(p.horizon);
    (u.uSunDir.value as THREE.Vector3).copy(this.sunDir);
    (u.uSunColor.value as THREE.Color).set(p.sunColor);
    (u.uCloudColor.value as THREE.Color).set(p.cloudColor);
    u.uCloudAmount.value = p.cloudAmount;
    u.uStarIntensity.value = p.starIntensity;
    (this.scene.fog as THREE.Fog).color.set(p.horizon);
  }

  /** t must be the shared wrapped time (WaveField.wrapTime) — sky motion
   * rates are quantized to the wrap, matching the ocean's discipline. */
  setSkyTime(t: number): void {
    this.skyMat.uniforms.uTime.value = t;
  }

  render(dt: number): void {
    this.updateGlide(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fpsEl.textContent = `${Math.round(this.frames / this.fpsTimer)} fps`;
      this.frames = 0;
      this.fpsTimer = 0;
    }
  }
}
