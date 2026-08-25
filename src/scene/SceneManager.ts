/**
 * Renderer, camera rig, sky, fog, sun. Orbit is clamped above the horizon and
 * zoom-limited per the plan's Phase 1 spec. Also owns the dev FPS overlay.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
varying vec3 vDir;
void main() {
  float h = clamp(normalize(vDir).y, 0.0, 1.0);
  gl_FragColor = vec4(mix(uHorizon, uZenith, pow(h, 0.6)), 1.0);
}
`;

export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly sunDir = new THREE.Vector3(0.6, 0.34, 0.42).normalize();
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
      400,
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

    // Sky dome + matching horizon fog.
    const horizon = new THREE.Color("#e5e9df");
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(300, 24, 16),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        uniforms: {
          uZenith: { value: new THREE.Color("#2a6390") },
          uHorizon: { value: horizon },
        },
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    this.scene.add(sky);
    this.scene.fog = new THREE.Fog(horizon, 55, 160);

    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    sun.position.copy(this.sunDir).multiplyScalar(100);
    this.scene.add(sun, new THREE.AmbientLight(0xbfd4de, 0.9));

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

  render(dt: number): void {
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
