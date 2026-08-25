import * as THREE from "three";
import { Animator } from "./animation/Animator";
import { ChessGame } from "./game/ChessGame";
import { GameController } from "./game/GameController";
import { PickController } from "./input/PickController";
import { ShipAnimator } from "./scene/ShipAnimator";
import { Effects } from "./scene/effects/sprites";
import { Fleet } from "./scene/Fleet";
import { Highlights } from "./scene/Highlights";
import { Ocean } from "./scene/Ocean";
import { SceneManager } from "./scene/SceneManager";
import { displace, wrapTime } from "./scene/WaveField";
import { START_FEN } from "./scene/fen";
import { BOARD_HALF, SQUARE_SIZE } from "./scene/waveConstants";
import { Hud } from "./ui/Hud";
import "./style.css";

const app = document.getElementById("app")!;
const sm = new SceneManager(app);
const ocean = new Ocean(sm.sunDir);
sm.scene.add(ocean.mesh);

const fleet = new Fleet(sm.scene);
fleet.syncTo(START_FEN);

// ---- Game wiring (Phase 4: real ship animation)
const highlights = new Highlights(sm.scene);
const hud = new Hud(app);
const game = new ChessGame();
const animator = new Animator();
// Hidden tabs get no animation frames: switch to instant (teleport) moves and
// flush anything in flight, so a mid-move tab switch never dangles the game.
document.addEventListener("visibilitychange", () => {
  animator.instantMode = document.hidden;
  if (document.hidden) animator.fastForward();
});
animator.instantMode = document.hidden;
const effects = new Effects(sm.scene, animator);
const shipAnimator = new ShipAnimator(fleet, animator, effects, () =>
  wrapTime(elapsedRef.value),
);
const controller = new GameController(
  game,
  shipAnimator,
  {
    onSelection: (sq, legal) => highlights.setSelection(sq, legal),
    onDenied: (sq) => highlights.flashDenial(sq),
    onCheck: (color) => fleet.setCheck(color),
    onTurn: (color) => {
      hud.setTurn(color);
      sm.glideToSide(color);
    },
    onPromotionPrompt: (active) => hud.showPromotion(active),
    onGameOver: (end) => hud.showGameOver(end),
  },
);
// Debug handle (harmless in production; invaluable under automation).
(window as unknown as Record<string, unknown>).__shipchess = {
  state: () => controller.currentState(),
  fen: () => game.fen(),
  turn: () => game.turn(),
};

hud.onPromotionPick = (p) => void controller.choosePromotion(p);
hud.onPromotionCancel = () => controller.cancelPromotion();
new PickController(sm.renderer.domElement, sm.camera, (square) =>
  void controller.clickSquare(square),
);

/** Anything that floats: anchored at a REST position, advected by the map. */
interface Floater {
  object: THREE.Object3D;
  restX: number;
  restZ: number;
  yOffset: number;
  tilt: boolean;
}
const floaters: Floater[] = [];
const _n = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();

function addFloater(
  object: THREE.Object3D,
  restX: number,
  restZ: number,
  yOffset = 0,
  tilt = true,
): void {
  sm.scene.add(object);
  floaters.push({ object, restX, restZ, yOffset, tilt });
}

// Corner buoys marking the play area (just outside the calm falloff start).
function buoy(): THREE.Object3D {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.16, 0.3, 10),
    new THREE.MeshStandardMaterial({ color: "#c8452c" }),
  );
  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.22, 10),
    new THREE.MeshStandardMaterial({ color: "#f2e4c9" }),
  );
  cap.position.y = 0.26;
  g.add(body, cap);
  return g;
}
for (const sx of [-1, 1])
  for (const sz of [-1, 1])
    addFloater(buoy(), sx * (BOARD_HALF + 0.35), sz * (BOARD_HALF + 0.35), 0.1);

// Rank/file labels as canvas sprites along two board edges (a–h, 1–8).
function labelSprite(text: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.font = "bold 40px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(242,240,230,0.92)";
  ctx.fillText(text, 32, 34);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c),
      depthWrite: false,
    }),
  );
  sprite.scale.setScalar(0.42);
  return sprite;
}
for (let i = 0; i < 8; i++) {
  const center = (i - 3.5) * SQUARE_SIZE;
  // files a–h along the near edge, ranks 1–8 along the left edge
  addFloater(
    labelSprite("abcdefgh"[i]),
    center,
    BOARD_HALF + 0.55,
    0.25,
    false,
  );
  addFloater(
    labelSprite(String(i + 1)),
    -(BOARD_HALF + 0.55),
    -center,
    0.25,
    false,
  );
}

// Render loop — dt clamped so a backgrounded tab resumes without a burst.
const elapsedRef = { value: 0 };
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  elapsedRef.value += dt;
  const t = wrapTime(elapsedRef.value);
  ocean.setTime(t);
  animator.tick(dt);
  fleet.update(t);
  highlights.update(t, dt);

  for (const f of floaters) {
    const s = displace(f.restX, f.restZ, t);
    f.object.position.set(s.x, s.y + f.yOffset, s.z);
    if (f.tilt) {
      _n.set(s.nx, s.ny, s.nz);
      _q.setFromUnitVectors(_up, _n);
      f.object.quaternion.slerp(_q, 0.15);
    }
  }

  sm.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
