/**
 * Unit inspection card (top-left): a small self-contained 3D viewport with
 * the selected ship spinning slowly, plus its service record. Styled to
 * match the HUD's smoked-glass panels. The mini renderer only draws while
 * the panel is visible.
 */
import * as THREE from "three";
import type { PieceType } from "../scene/ships/builders";
import { buildShip } from "../scene/ships/builders";
import type { FleetMaterials } from "../scene/ships/parts";
import { makeFleetMaterials } from "../scene/ships/parts";
import type { UnitStats } from "../game/unitStats";

const FONT_UI = '"Saira", "Avenir Next", system-ui, sans-serif';

const PIECE_NAMES: Record<PieceType, string> = {
  p: "Pawn",
  n: "Knight",
  b: "Bishop",
  r: "Rook",
  q: "Queen",
  k: "King",
};

const SHIP_CLASSES: Record<PieceType, string> = {
  p: "Patrol Boat",
  n: "Submarine",
  b: "Destroyer",
  r: "Battleship",
  q: "Aircraft Carrier",
  k: "Fleet Command Vessel",
};

const CSS = `
.sup-root {
  position: fixed; top: 10px; left: 10px; z-index: 10; width: 196px;
  display: none; overflow: hidden;
  background: rgba(8,20,28,.82); border: 1px solid #33566a;
  border-radius: 14px; backdrop-filter: blur(3px);
  color: #e9ece4; font: 13px ${FONT_UI};
}
.sup-root.on { display: block; }
.sup-view { display: block; width: 100%; height: 148px; }
.sup-head { padding: 2px 14px 8px; border-bottom: 1px solid rgba(51,86,106,.6); }
.sup-title {
  font: 700 16px ${FONT_UI}; letter-spacing: .07em; text-transform: uppercase;
  color: #d9b45c;
}
.sup-sub { font: 12px ${FONT_UI}; color: #9fc4c9; letter-spacing: .04em; }
.sup-rows { padding: 9px 14px 12px; display: flex; flex-direction: column; gap: 5px; }
.sup-row { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; }
.sup-row .k { color: #9fc4c9; }
.sup-row .v { font-weight: 600; font-variant-numeric: tabular-nums; }
`;

export interface UnitInfo {
  type: PieceType;
  color: "w" | "b";
  stats: UnitStats;
  targets: number;
}

export class UnitPanel {
  private readonly root: HTMLDivElement;
  private readonly titleEl: HTMLElement;
  private readonly subEl: HTMLElement;
  private readonly rowsEl: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer | null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 196 / 148, 0.01, 20);
  private readonly materials: Record<"w" | "b", FleetMaterials>;
  private readonly cache = new Map<string, THREE.Group>();
  private current: THREE.Group | null = null;
  private visible = false;

  constructor(container: HTMLElement) {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = document.createElement("div");
    this.root.className = "sup-root";
    const canvas = document.createElement("canvas");
    canvas.className = "sup-view";
    this.root.appendChild(canvas);
    const head = document.createElement("div");
    head.className = "sup-head";
    this.titleEl = document.createElement("div");
    this.titleEl.className = "sup-title";
    this.subEl = document.createElement("div");
    this.subEl.className = "sup-sub";
    head.append(this.titleEl, this.subEl);
    this.rowsEl = document.createElement("div");
    this.rowsEl.className = "sup-rows";
    this.root.append(head, this.rowsEl);
    container.appendChild(this.root);

    this.materials = { w: makeFleetMaterials(true), b: makeFleetMaterials(false) };

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(196, 148, false);
    } catch {
      // Headless/no-context: the card still shows the text record.
    }
    this.renderer = renderer;

    const key = new THREE.DirectionalLight(0xfff2dd, 2.4);
    key.position.set(2, 3, 2);
    const rim = new THREE.DirectionalLight(0xdfe9f2, 1.1);
    rim.position.set(-2, 2, -2);
    this.scene.add(key, rim, new THREE.AmbientLight(0xbfd4de, 1.1));
  }

  show(info: UnitInfo): void {
    const cacheKey = `${info.type}:${info.color}`;
    let ship = this.cache.get(cacheKey);
    if (!ship) {
      ship = buildShip(info.type, this.materials[info.color]);
      this.cache.set(cacheKey, ship);
    }
    if (this.current !== ship) {
      if (this.current) this.scene.remove(this.current);
      this.scene.add(ship);
      this.current = ship;
      // Frame the ship: center it and pull the camera back by its size.
      const box = new THREE.Box3().setFromObject(ship);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()).length();
      ship.position.sub(center);
      const d = size * 1.15;
      this.camera.position.set(d * 0.8, d * 0.55, d * 0.8);
      this.camera.lookAt(0, 0, 0);
    }

    this.titleEl.textContent = PIECE_NAMES[info.type];
    this.subEl.textContent = `${SHIP_CLASSES[info.type]} — ${
      info.color === "w" ? "White" : "Black"
    } fleet`;
    const rows: Array<[string, string]> = [
      ["Chess piece", PIECE_NAMES[info.type]],
      ["Ship class", SHIP_CLASSES[info.type]],
      ["Voyage span", `${info.stats.tiles} tile${info.stats.tiles === 1 ? "" : "s"}`],
      ["Sorties", String(info.stats.sorties)],
      [
        "Battles won",
        `${info.stats.battles} battle${info.stats.battles === 1 ? "" : "s"}`,
      ],
      ["Targets in range", String(info.targets)],
    ];
    this.rowsEl.innerHTML = rows
      .map(
        ([k, v]) =>
          `<div class="sup-row"><span class="k">${k}</span><span class="v">${v}</span></div>`,
      )
      .join("");

    this.visible = true;
    this.root.classList.add("on");
  }

  hide(): void {
    this.visible = false;
    this.root.classList.remove("on");
  }

  /** Call once per frame from the main loop; renders only while visible. */
  update(dt: number): void {
    if (!this.visible || !this.renderer || !this.current) return;
    this.current.rotation.y += dt * 0.55;
    this.renderer.render(this.scene, this.camera);
  }
}
