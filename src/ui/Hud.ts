/**
 * Phase 5 HUD: main menu (over the live idle ocean), turn pill, algebraic
 * move list, captured-ship tallies, command buttons (undo / resign / draw /
 * menu), promotion picker, end-of-game overlay with rematch — no reloads.
 */
import type { Color, EndState, PromotionPiece } from "../game/ChessGame";
import type { GameConfig, PositionSync } from "../game/GameController";
import type { Settings } from "./settings";

const SHIP_NAMES: Record<PromotionPiece, string> = {
  q: "Carrier",
  r: "Battleship",
  b: "Frigate",
  n: "Submarine",
};

const PIECE_LETTER: Record<string, string> = {
  p: "P",
  n: "N",
  b: "B",
  r: "R",
  q: "Q",
  k: "K",
};

const END_TEXT: Record<EndState["kind"], string> = {
  checkmate: "Checkmate",
  stalemate: "Stalemate — both fleets hold station",
  threefold: "Draw — threefold repetition",
  "fifty-move": "Draw — fifty quiet moves",
  "insufficient-material": "Draw — insufficient firepower",
  resignation: "The flag is struck",
  agreement: "Draw — both admirals agree",
};

const BTN =
  "background:#1d3947;color:#e9ece4;border:1px solid #3e6878;border-radius:6px;" +
  "padding:8px 12px;font:14px system-ui;cursor:pointer";

const FONT_UI = '"Saira", system-ui, sans-serif';

const MENU_CSS = /* css */ `
.scm-root {
  position: fixed; inset: 0; z-index: 25; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 14px; color: #f2f0e6;
  font: 14px ${FONT_UI}; text-align: center;
}
.scm-title {
  font: 400 clamp(44px, 7vw, 68px) "Saira Stencil One", ${FONT_UI};
  letter-spacing: .12em; line-height: 1; color: #f2f0e6;
  text-shadow: 0 3px 22px rgba(4,12,18,.9), 0 1px 0 rgba(4,12,18,.6);
}
.scm-tag {
  font: 600 13px ${FONT_UI}; letter-spacing: .34em; text-transform: uppercase;
  color: #9fc4c9; text-shadow: 0 1px 8px rgba(4,12,18,.9); margin-bottom: 10px;
}
.scm-cards { display: flex; gap: 14px; }
.scm-card {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  width: 200px; padding: 18px 16px 16px; cursor: pointer;
  background: rgba(8,20,28,.78); color: #e9ece4;
  border: 1px solid #33566a; border-radius: 14px;
  font: 14px ${FONT_UI};
  transition: transform .15s ease, border-color .15s ease, background .15s ease;
  backdrop-filter: blur(3px);
}
.scm-card:hover { transform: translateY(-3px); border-color: #d9b45c; background: rgba(10,26,36,.86); }
.scm-card.open { border-color: #d9b45c; }
.scm-card-icon { font-size: 30px; line-height: 1; color: #d9b45c; }
.scm-card-name { font: 700 18px ${FONT_UI}; letter-spacing: .04em; }
.scm-card-sub { font-size: 12px; color: #9fc4c9; }
.scm-solo[hidden] { display: none; }
.scm-solo {
  display: flex; flex-direction: column; gap: 8px; width: 414px; max-width: 90vw;
  padding: 16px 18px; background: rgba(8,20,28,.82); border: 1px solid #33566a;
  border-radius: 14px; backdrop-filter: blur(3px);
}
.scm-label {
  font: 600 11px ${FONT_UI}; letter-spacing: .22em; text-transform: uppercase;
  color: #9fc4c9; text-align: left; margin-top: 4px;
}
.scm-seg { display: flex; border: 1px solid #33566a; border-radius: 9px; overflow: hidden; }
.scm-seg-btn {
  flex: 1; padding: 9px 6px; background: transparent; color: #cfe0e8;
  border: none; border-right: 1px solid #33566a; cursor: pointer;
  font: 600 13px ${FONT_UI}; display: flex; align-items: center; justify-content: center; gap: 6px;
  transition: background .12s ease, color .12s ease;
}
.scm-seg-btn:last-child { border-right: none; }
.scm-seg-btn:hover { background: rgba(159,196,201,.12); }
.scm-seg-btn.sel { background: #d9b45c; color: #14232b; }
.scm-dot { width: 11px; height: 11px; border-radius: 50%; display: inline-block; }
.scm-dot-w { background: #e8e2d4; border: 1px solid #8a8578; }
.scm-dot-b { background: #3a4148; border: 1px solid #1d2226; }
.scm-hint { font-size: 12px; color: #9fc4c9; min-height: 16px; }
.scm-cta {
  margin-top: 6px; padding: 12px; border: none; border-radius: 9px; cursor: pointer;
  background: #d9b45c; color: #14232b; font: 700 16px ${FONT_UI};
  letter-spacing: .08em; text-transform: uppercase;
  transition: transform .12s ease, filter .12s ease;
}
.scm-cta:hover { transform: translateY(-1px); filter: brightness(1.07); }
.scm-toggle {
  display: flex; gap: 8px; align-items: center; color: #cfe0e8; cursor: pointer;
  font: 13px ${FONT_UI}; text-shadow: 0 1px 6px rgba(4,12,18,.8);
}
.scm-toggle input { accent-color: #d9b45c; width: 15px; height: 15px; }
.scm-foot {
  position: fixed; bottom: 14px; left: 0; right: 0; text-align: center;
  font: 12px ${FONT_UI}; letter-spacing: .1em; color: rgba(207,224,232,.55);
}
`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  css: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
}

export class Hud {
  private readonly turnEl: HTMLDivElement;
  private readonly promoEl: HTMLDivElement;
  private readonly overEl: HTMLDivElement;
  private readonly menuEl: HTMLDivElement;
  private readonly sideEl: HTMLDivElement;
  private readonly movesEl: HTMLDivElement;
  private readonly tallyEl: HTMLDivElement;
  private readonly thinkingEl: HTMLDivElement;
  private escHandler!: (e: KeyboardEvent) => void;
  private styleEl!: HTMLStyleElement;
  private readonly confirmResets: Array<() => void> = [];

  onPromotionPick: ((p: PromotionPiece) => void) | null = null;
  onPromotionCancel: (() => void) | null = null;
  onStartGame: ((config: GameConfig) => void) | null = null;
  onUndo: (() => void) | null = null;
  onResign: (() => void) | null = null;
  onOfferDraw: (() => void) | null = null;
  onMenu: (() => void) | null = null;
  onSettingsChange: ((s: Settings) => void) | null = null;

  constructor(container: HTMLElement, settings: Settings) {
    // Turn pill.
    this.turnEl = el(
      "div",
      "position:fixed;top:8px;left:50%;transform:translateX(-50%);color:#f2f0e6;" +
        "background:rgba(10,26,36,.55);font:14px system-ui;padding:4px 14px;" +
        "border-radius:14px;z-index:10;letter-spacing:.04em",
    );
    container.appendChild(this.turnEl);

    // Thinking cue (Phase 6 fills it with download progress).
    this.thinkingEl = el(
      "div",
      "position:fixed;top:40px;left:50%;transform:translateX(-50%);color:#cfe0e8;" +
        "background:rgba(10,26,36,.45);font:12px system-ui;padding:2px 10px;" +
        "border-radius:10px;z-index:10;display:none",
      "The admiral is thinking…",
    );
    container.appendChild(this.thinkingEl);

    // Side panel: moves + tallies + commands.
    this.sideEl = el(
      "div",
      "position:fixed;top:8px;right:8px;width:172px;display:none;flex-direction:column;" +
        "gap:8px;background:rgba(10,26,36,.55);border-radius:8px;padding:10px;" +
        "color:#dce7ea;font:12px system-ui;z-index:10",
    );
    this.tallyEl = el("div", "min-height:28px;line-height:1.5");
    this.movesEl = el(
      "div",
      "max-height:38vh;overflow-y:auto;line-height:1.6;white-space:pre-line;" +
        "font:12px ui-monospace,monospace",
    );
    const cmds = el("div", "display:flex;flex-wrap:wrap;gap:6px");
    const mkBtn = (label: string, fn: () => void, confirmLabel?: string) => {
      const b = el("button", BTN + ";padding:5px 8px;font-size:12px", label);
      let armed = false;
      let timer = 0;
      this.confirmResets.push(() => {
        armed = false;
        b.textContent = label;
      });
      b.addEventListener("click", () => {
        // Never window.confirm(): modal dialogs block the page (and any
        // automation). Two-click inline confirm instead.
        if (!confirmLabel || armed) {
          armed = false;
          b.textContent = label;
          fn();
          return;
        }
        armed = true;
        b.textContent = confirmLabel;
        clearTimeout(timer);
        timer = window.setTimeout(() => {
          armed = false;
          b.textContent = label;
        }, 3000);
      });
      cmds.appendChild(b);
    };
    mkBtn("Undo", () => this.onUndo?.());
    mkBtn("Resign", () => this.onResign?.(), "Strike colors?");
    mkBtn("Draw", () => this.onOfferDraw?.(), "Both agree?");
    mkBtn("Menu", () => this.onMenu?.());
    this.sideEl.append(this.tallyEl, this.movesEl, cmds);
    container.appendChild(this.sideEl);

    // Promotion picker.
    this.promoEl = el(
      "div",
      "position:fixed;inset:0;display:none;align-items:center;justify-content:center;" +
        "background:rgba(4,12,18,.45);z-index:20",
    );
    const card = el(
      "div",
      "background:#10222b;border:1px solid #2a4a58;border-radius:10px;padding:18px;" +
        "display:flex;gap:10px;flex-direction:column;align-items:center;color:#dce7ea;" +
        "font:15px system-ui",
    );
    card.appendChild(el("div", "", "Promote to…"));
    const row = el("div", "display:flex;gap:8px");
    (Object.keys(SHIP_NAMES) as PromotionPiece[]).forEach((p) => {
      const b = el("button", BTN, SHIP_NAMES[p]);
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        this.onPromotionPick?.(p);
      });
      row.appendChild(b);
    });
    card.appendChild(row);
    card.addEventListener("click", (e) => e.stopPropagation());
    this.promoEl.appendChild(card);
    this.promoEl.addEventListener("click", () => this.onPromotionCancel?.());
    this.escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && this.promoEl.style.display !== "none") {
        this.onPromotionCancel?.();
      }
    };
    window.addEventListener("keydown", this.escHandler);
    container.appendChild(this.promoEl);

    // Game-over overlay.
    this.overEl = el(
      "div",
      "position:fixed;inset:0;display:none;align-items:center;justify-content:center;" +
        "background:rgba(4,12,18,.5);z-index:30;flex-direction:column;gap:14px;" +
        "color:#f2f0e6;font:600 26px system-ui;text-align:center",
    );
    container.appendChild(this.overEl);

    // Main menu — structured DOM + injected stylesheet (hover/selected
    // states need real CSS, and native <select>s read as archaic).
    this.styleEl = document.createElement("style");
    this.styleEl.textContent = MENU_CSS;
    document.head.appendChild(this.styleEl);

    this.menuEl = el("div", "");
    this.menuEl.className = "scm-root";
    this.menuEl.innerHTML = `
      <div class="scm-title">SHIPCHESS</div>
      <div class="scm-tag">Chess on the open sea</div>
      <div class="scm-cards">
        <button class="scm-card" data-mode="hotseat">
          <span class="scm-card-icon">⚔</span>
          <span class="scm-card-name">Two Admirals</span>
          <span class="scm-card-sub">Hotseat — share this screen</span>
        </button>
        <button class="scm-card" data-mode="solo">
          <span class="scm-card-icon">☸</span>
          <span class="scm-card-name">Face the Admiral</span>
          <span class="scm-card-sub">Single player — pick fleet &amp; rank</span>
        </button>
      </div>
      <div class="scm-solo" hidden>
        <div class="scm-label">Your fleet</div>
        <div class="scm-seg" data-group="fleet">
          <button class="scm-seg-btn sel" data-v="w"><span class="scm-dot scm-dot-w"></span>Ivory</button>
          <button class="scm-seg-btn" data-v="b"><span class="scm-dot scm-dot-b"></span>Charcoal</button>
        </div>
        <div class="scm-label">Opposing rank</div>
        <div class="scm-seg scm-seg-4" data-group="rank">
          <button class="scm-seg-btn sel" data-v="cadet">Cadet</button>
          <button class="scm-seg-btn" data-v="captain">Captain</button>
          <button class="scm-seg-btn" data-v="admiral">Admiral</button>
          <button class="scm-seg-btn" data-v="fleet">Fleet Adm.</button>
        </div>
        <div class="scm-hint" data-rankhint>Learning the ropes — expect blunders</div>
        <button class="scm-cta">Set sail</button>
      </div>
      <label class="scm-toggle">
        <input type="checkbox" data-fast /><span>Fast animations</span>
      </label>
      <div class="scm-foot">drag to orbit · scroll to zoom · click a ship to move</div>
    `;
    container.appendChild(this.menuEl);

    const q = <T extends Element>(sel: string) =>
      this.menuEl.querySelector(sel) as T;
    const soloPanel = q<HTMLDivElement>(".scm-solo");
    const soloCard = q<HTMLButtonElement>('[data-mode="solo"]');
    q<HTMLButtonElement>('[data-mode="hotseat"]').addEventListener(
      "click",
      () => this.onStartGame?.({ aiColor: null }),
    );
    soloCard.addEventListener("click", () => {
      const open = soloPanel.hidden === true;
      soloPanel.hidden = !open;
      soloCard.classList.toggle("open", open);
    });
    const RANK_HINTS: Record<string, string> = {
      cadet: "Learning the ropes — expect blunders",
      captain: "A steady hand on the tiller",
      admiral: "Decorated and dangerous",
      fleet: "Full strength — bring everything you have",
    };
    for (const seg of this.menuEl.querySelectorAll<HTMLElement>(".scm-seg")) {
      seg.addEventListener("click", (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>(".scm-seg-btn");
        if (!btn) return;
        for (const b of seg.querySelectorAll(".scm-seg-btn"))
          b.classList.toggle("sel", b === btn);
        if (seg.dataset.group === "rank") {
          q<HTMLDivElement>("[data-rankhint]").textContent =
            RANK_HINTS[btn.dataset.v ?? "cadet"];
        }
      });
    }
    q<HTMLButtonElement>(".scm-cta").addEventListener("click", () => {
      const fleet =
        this.menuEl.querySelector<HTMLElement>(
          '[data-group="fleet"] .scm-seg-btn.sel',
        )?.dataset.v ?? "w";
      const rank =
        this.menuEl.querySelector<HTMLElement>(
          '[data-group="rank"] .scm-seg-btn.sel',
        )?.dataset.v ?? "cadet";
      this.onStartGame?.({
        aiColor: fleet === "w" ? "b" : "w",
        difficulty: rank as GameConfig["difficulty"],
      });
    });
    const fastCb = q<HTMLInputElement>("[data-fast]");
    fastCb.checked = settings.fastAnimations;
    fastCb.addEventListener("change", () => {
      settings.fastAnimations = fastCb.checked;
      this.onSettingsChange?.(settings);
    });
  }

  dispose(): void {
    window.removeEventListener("keydown", this.escHandler);
    for (const e of [
      this.turnEl,
      this.promoEl,
      this.overEl,
      this.menuEl,
      this.sideEl,
      this.thinkingEl,
      this.styleEl,
    ]) {
      e.remove();
    }
  }

  showMenu(active: boolean): void {
    // Armed confirms never leak across games/menus (review P5-10).
    for (const reset of this.confirmResets) reset();
    this.menuEl.style.display = active ? "flex" : "none";
    this.sideEl.style.display = active ? "none" : "flex";
    this.turnEl.style.display = active ? "none" : "block";
    if (active) this.overEl.style.display = "none";
  }

  setTurn(color: Color): void {
    this.turnEl.textContent =
      color === "w" ? "Ivory fleet to move" : "Charcoal fleet to move";
  }

  setThinking(active: boolean): void {
    this.thinkingEl.style.display = active ? "block" : "none";
  }

  /** One sync channel: move list + tallies from authoritative history. */
  setPosition(sync: PositionSync): void {
    const rows: string[] = [];
    for (let i = 0; i < sync.sanHistory.length; i += 2) {
      rows.push(
        `${i / 2 + 1}. ${sync.sanHistory[i]} ${sync.sanHistory[i + 1] ?? ""}`,
      );
    }
    this.movesEl.textContent = rows.join("\n");
    this.movesEl.scrollTop = this.movesEl.scrollHeight;

    const count = (color: Color) =>
      sync.captured
        .filter((c) => c.color === color)
        .map((c) => PIECE_LETTER[c.type] ?? "?")
        .sort()
        .join(" ");
    this.tallyEl.innerHTML =
      `<div>Ivory prizes: <b>${count("b") || "—"}</b></div>` +
      `<div>Charcoal prizes: <b>${count("w") || "—"}</b></div>`;
  }

  showPromotion(active: boolean): void {
    this.promoEl.style.display = active ? "flex" : "none";
  }

  showGameOver(end: EndState, onRematch: () => void, onMenu: () => void): void {
    const winner =
      end.winner === undefined
        ? ""
        : end.winner === "w"
          ? " — the Ivory fleet prevails"
          : " — the Charcoal fleet prevails";
    this.overEl.innerHTML = "";
    this.overEl.appendChild(el("div", "", END_TEXT[end.kind] + winner));
    const row = el("div", "display:flex;gap:10px");
    const again = el("button", BTN + ";font-size:15px", "Rematch");
    again.addEventListener("click", () => {
      this.overEl.style.display = "none";
      onRematch();
    });
    const menu = el("button", BTN + ";font-size:15px", "Back to menu");
    menu.addEventListener("click", () => {
      this.overEl.style.display = "none";
      onMenu();
    });
    row.append(again, menu);
    this.overEl.appendChild(row);
    this.overEl.style.display = "flex";
  }
}
