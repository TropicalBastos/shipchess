import * as THREE from "three";
import { Animator } from "./animation/Animator";
import { ChessGame } from "./game/ChessGame";
import { GameController } from "./game/GameController";
import type { GameConfig } from "./game/GameController";
import type { AiPlayer } from "./game/GameController";
import {
  MaterialAiPlayer,
  StockfishAiPlayer,
  workerTransport,
} from "./game/ai/StockfishAiPlayer";
import { PickController } from "./input/PickController";
import type { PieceType } from "./scene/ships/builders";
import { loadSettings, saveSettings } from "./ui/settings";
import { preloadShipModels } from "./scene/ships/models";
import { AudioManager } from "./audio/AudioManager";
import { SUN_PRESETS, lerpPreset, oceanPaletteArgs } from "./scene/presets";
import { ShipAnimator } from "./scene/ShipAnimator";
import { Effects } from "./scene/effects/sprites";
import { Fleet } from "./scene/Fleet";
import { Highlights } from "./scene/Highlights";
import { Ocean } from "./scene/Ocean";
import { SceneManager } from "./scene/SceneManager";
import { wrapTime } from "./scene/WaveField";
import { START_FEN } from "./scene/fen";
import { BOARD_HALF, SQUARE_SIZE } from "./scene/waveConstants";
import { Hud } from "./ui/Hud";
import "./style.css";

const app = document.getElementById("app")!;
const sm = new SceneManager(app);
const bootSettings = loadSettings();
const ocean = new Ocean(sm.sunDir, bootSettings.quality === "low" ? 0.5 : 1);
sm.scene.add(ocean.mesh);

// Textured ship models load before the fleet builds (procedural fallback
// on failure — the board must never come up empty).
await preloadShipModels().catch(() => {});
const fleet = new Fleet(sm.scene);
fleet.syncTo(START_FEN);

// ---- Game wiring (Phase 5: full loop — menu, undo, resign/draw, rematch)
const settings = bootSettings;
const audio = new AudioManager(settings.volume);
// Unlock on ANY gesture kind, repeatedly (resume covers suspended contexts,
// keyboard-only players included — P7-03).
window.addEventListener("pointerdown", () => audio.unlock());
window.addEventListener("keydown", () => audio.unlock());

let activePreset = SUN_PRESETS[settings.sunPreset] ?? SUN_PRESETS.day;
function paintPreset(p: ReturnType<typeof lerpPreset>): void {
  sm.applyPreset(p);
  ocean.setSunDir(sm.sunDir);
  ocean.setPalette(...oceanPaletteArgs(p));
  // Board light pool tracks the spotlight: subtle by day, strong at night.
  ocean.setBoardLight(0.15 + Math.max(0, 2.2 - p.sunIntensity) * 0.5);
}
/** Smoothly cross-fade the whole lighting rig to a new time of day. */
function applySunPreset(name: keyof typeof SUN_PRESETS): void {
  const target = SUN_PRESETS[name] ?? SUN_PRESETS.day;
  if (target === activePreset) return;
  const from = activePreset;
  activePreset = target;
  void animator.tween(1.2, (v) => paintPreset(lerpPreset(from, target, v)));
}
paintPreset(activePreset);
const highlights = new Highlights(sm.scene);
const hud = new Hud(app, settings);
const game = new ChessGame();
const animator = new Animator();
// Hidden tabs get no animation frames: switch to instant (teleport) moves and
// flush anything in flight, so a mid-move tab switch never dangles the game.
document.addEventListener("visibilitychange", () => {
  animator.instantMode = document.hidden || settings.reducedMotion;
  if (document.hidden) animator.fastForward();
});
animator.instantMode = document.hidden || settings.reducedMotion;
const effects = new Effects(sm.scene, animator);
const shipAnimator = new ShipAnimator(fleet, animator, effects, () =>
  wrapTime(elapsedRef.value),
);

async function sinkFlagshipFlourish(loser: "w" | "b"): Promise<void> {
  const handle = fleet.flagshipHandle(loser);
  if (!handle) return;
  void effects.splash(handle.restX, handle.restZ, wrapTime(elapsedRef.value), 1.4);
  await animator.tween(1.1, (v) => handle.setSink(v * 0.9));
}

// ---- The admiral: lazy Stockfish behind a facade; MaterialAiPlayer fallback
// (visibly reduced-strength) if the engine cannot load.
const ENGINE_URL = import.meta.env.BASE_URL + "engine/stockfish-18-lite-single.js";
let engine: StockfishAiPlayer | null = null;
let fallback: MaterialAiPlayer | null = null;
const aiFacade: AiPlayer = {
  async requestMove(fen, difficulty) {
    if (fallback) return fallback.requestMove(fen);
    try {
      engine ??= new StockfishAiPlayer(workerTransport(ENGINE_URL));
      engine.difficulty = difficulty ?? "cadet";
      return await engine.requestMove(fen);
    } catch (err) {
      console.error("Stockfish unavailable — degrading to material AI", err);
      hud.toast("Engine unavailable — playing at reduced strength");
      fallback = new MaterialAiPlayer();
      return fallback.requestMove(fen);
    }
  },
};

const soundedAnimator = {
  play: (move: Parameters<typeof shipAnimator.play>[0]) => {
    if (move.capturedSquare) {
      audio.cannon();
      setTimeout(() => audio.sink(), 350);
    } else if (move.piece === "n") {
      audio.sonar();
    } else {
      audio.whoosh();
    }
    return shipAnimator.play(move);
  },
};

const controller: GameController = new GameController(
  game,
  soundedAnimator,
  {
    onSelection: (sq, legal) => {
      if (sq) audio.creak();
      highlights.setSelection(sq, legal);
    },
    onDenied: (sq) => highlights.flashDenial(sq),
    onCheck: (color) => {
      fleet.setCheck(color);
      if (color) audio.alarm();
    },
    onTurn: (color) => {
      hud.setTurn(color);
      // Reduced motion means no 1.1s camera sweeps either (P7-02).
      if (!settings.cameraGlide || settings.reducedMotion) return;
      // Hotseat: swing to the mover. AI game: hold the human's side.
      const humanSide =
        lastConfig.aiColor === null
          ? color
          : lastConfig.aiColor === "w"
            ? "b"
            : "w";
      sm.glideToSide(humanSide);
    },
    onPromotionPrompt: (active) => hud.showPromotion(active),
    onGameOver: (end) => {
      const myEnd = ++endSeq; // identity, not just state (round-2 RF-01)
      void (async () => {
        const loser =
          end.winner === undefined ? null : end.winner === "w" ? "b" : "w";
        if (loser) await sinkFlagshipFlourish(loser);
        // The user may have hit Menu/Undo — or reached a NEWER game over —
        // during the flourish. Only the latest terminal event may mount.
        if (controller.currentState() !== "gameOver" || myEnd !== endSeq) return;
        hud.showGameOver(
          end,
          () => startWithConfig(lastConfig),
          () => controller.toMenu(),
        );
      })();
    },
    onPosition: (sync) => {
      hud.setPosition(sync);
      hud.showMenu(sync.inMenu);
      fleet.setCaptured(
        sync.captured as Array<{ type: PieceType; color: "w" | "b" }>,
      );
      // After a move the animator already reconciled (re-sync would cancel
      // the promotion rise); every reset — including returning to the menu —
      // rebuilds the fleet, un-sinking any flourished flagship (P5-06).
      if (sync.reason === "reset") fleet.syncTo(sync.fen);
    },
    onAiThinking: (active) => hud.setThinking(active),
  },
  aiFacade,
);

let lastConfig: GameConfig = { aiColor: null };
let endSeq = 0;
function startWithConfig(config: GameConfig): void {
  lastConfig = config;
  if (config.aiColor && !fallback) {
    // Sync Worker construction can throw (e.g. CSP) — degrade, never abort
    // the game start (P6-02). Rematches route through here too, so every
    // AI game gets its ucinewgame (P6-08).
    try {
      engine ??= new StockfishAiPlayer(workerTransport(ENGINE_URL));
      hud.toast("The admiral is boarding…", 1500);
      engine
        .ensureReady()
        .then(() => engine?.newGame())
        .catch(() => {
          hud.toast("Engine unavailable — playing at reduced strength");
          fallback = new MaterialAiPlayer();
        });
    } catch (err) {
      console.error("Worker construction failed", err);
      hud.toast("Engine unavailable — playing at reduced strength");
      fallback = new MaterialAiPlayer();
    }
  }
  controller.startGame(config);
}
hud.onStartGame = startWithConfig;
hud.onUndo = () => controller.undo();
hud.onResign = () => controller.resign();
hud.onOfferDraw = () => controller.agreeDraw();
hud.onMenu = () => controller.toMenu();
hud.onSettingsChange = (s) => {
  saveSettings(s);
  audio.setVolume(s.volume);
  applySunPreset(s.sunPreset);
  animator.instantMode = document.hidden || s.reducedMotion;
  if (s.reducedMotion || !s.cameraGlide) sm.cancelGlide(); // RF-02
};

// Debug handle (harmless in production; invaluable under automation).
(window as unknown as Record<string, unknown>).__shipchess = {
  state: () => controller.currentState(),
  fen: () => game.fen(),
  turn: () => game.turn(),
  controller,
};

hud.onPromotionPick = (p) => void controller.choosePromotion(p);
hud.onPromotionCancel = () => controller.cancelPromotion();
new PickController(sm.renderer.domElement, sm.camera, (square) =>
  void controller.clickSquare(square),
);

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
  // files a–h along the near edge, ranks 1–8 along the left edge.
  // Labels are PINNED at rest height, not floaters — readable coordinates
  // must not sway with the water (user direction, 2026-08-25).
  const file = labelSprite("abcdefgh"[i]);
  file.position.set(center, 0.25, BOARD_HALF + 0.55);
  const rank = labelSprite(String(i + 1));
  rank.position.set(-(BOARD_HALF + 0.55), 0.25, -center);
  sm.scene.add(file, rank);
}

// WebGL context loss: pause the world (three.js re-uploads GPU resources on
// restore); the clamped dt already prevents a resume burst (plan Phase 8).
let contextLost = false;
sm.renderer.domElement.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  contextLost = true;
  hud.toast("Reconnecting to the GPU…", Infinity);
});
sm.renderer.domElement.addEventListener("webglcontextrestored", () => {
  contextLost = false;
  hud.toast("Back on the water", 1500);
});

// Render loop — dt clamped so a backgrounded tab resumes without a burst.
const elapsedRef = { value: 0 };
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  if (contextLost) {
    requestAnimationFrame(frame);
    return; // world time freezes with the canvas — nothing advances unseen
  }

  elapsedRef.value += dt;
  const t = wrapTime(elapsedRef.value);
  ocean.setTime(t);
  sm.setSkyTime(t);
  animator.tick(dt * (settings.fastAnimations ? 4 : 1));
  fleet.update(t);
  highlights.update(t, dt);

  sm.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.getElementById("splash")?.remove(); // setup complete (P8-01)
