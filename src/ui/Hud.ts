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

/* In-game corner button + pause overlay */
.scp-mini {
  position: fixed; top: 10px; right: 10px; z-index: 10; display: none;
  align-items: center; gap: 7px; padding: 9px 14px; cursor: pointer;
  background: rgba(8,20,28,.8); border: 1px solid #33566a; border-radius: 10px;
  color: #e9ece4; font: 600 13px ${FONT_UI}; backdrop-filter: blur(3px);
  transition: border-color .12s ease;
}
.scp-mini:hover { border-color: #d9b45c; }
.scp-mini .ico { color: #d9b45c; }
.scp-pause {
  position: fixed; inset: 0; z-index: 22; display: none; align-items: center;
  justify-content: center; background: rgba(4,12,18,.55);
}
.scp {
  width: 250px; display: flex; flex-direction: column; gap: 10px; padding: 16px;
  background: rgba(8,20,28,.92); border: 1px solid #33566a; border-radius: 14px;
  color: #dce7ea; font: 13px ${FONT_UI};
}
.scp-resume {
  padding: 10px; border: none; border-radius: 9px; cursor: pointer;
  background: #d9b45c; color: #14232b; font: 700 14px ${FONT_UI};
  letter-spacing: .06em; text-transform: uppercase;
}
.scp-quit {
  padding: 8px; cursor: pointer; border-radius: 8px; background: transparent;
  color: #9fc4c9; border: 1px solid #33566a; font: 600 12px ${FONT_UI};
}
.scp-quit:hover { border-color: #e0523c; color: #e9ece4; }
.scp-head {
  font: 600 10px ${FONT_UI}; letter-spacing: .22em; text-transform: uppercase;
  color: #9fc4c9; text-align: left;
}
.scp-fleet { display: flex; align-items: center; gap: 7px; min-height: 22px; }
.scp-fleet .scm-dot { flex: none; }
.scp-fleet-name { font-weight: 600; width: 62px; text-align: left; }
.scp-chips { display: flex; flex-wrap: wrap; gap: 3px; flex: 1; }
.scp-chip {
  width: 16px; height: 16px; border-radius: 4px; font: 700 10px ${FONT_UI};
  display: inline-flex; align-items: center; justify-content: center;
}
.scp-chip-b { background: #3a4148; color: #cfe0e8; border: 1px solid #1d2226; }
.scp-chip-w { background: #e8e2d4; color: #2c3338; border: 1px solid #8a8578; }
.scp-adv { font: 700 11px ${FONT_UI}; color: #d9b45c; }
.scp-log {
  max-height: 34vh; overflow-y: auto; text-align: left; line-height: 1.7;
  white-space: pre-line; font: 12px ui-monospace, monospace; color: #cfe0e8;
  border-top: 1px solid #1f3641; border-bottom: 1px solid #1f3641; padding: 6px 0;
}
.scp-log:empty::before { content: "No moves yet"; color: #5f7d87; font-style: italic; }
.scp-cmds { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.scp-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px 6px; cursor: pointer; border-radius: 8px;
  background: rgba(29,57,71,.9); color: #e9ece4; border: 1px solid #3e6878;
  font: 600 12px ${FONT_UI};
  transition: background .12s ease, border-color .12s ease;
}
.scp-btn:hover { border-color: #d9b45c; background: rgba(29,57,71,1); }
.scp-btn .ico { color: #d9b45c; font-size: 13px; }
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
  private pauseEl!: HTMLDivElement;
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

    // Side panel: scoreboard + move log + command grid (styled via MENU_CSS —
    // injected below, before the panel is built).
    this.styleEl = document.createElement("style");
    this.styleEl.textContent = MENU_CSS;
    document.head.appendChild(this.styleEl);

    this.sideEl = el("button", "") as unknown as HTMLDivElement;
    this.sideEl.className = "scp-mini";
    this.sideEl.innerHTML = '<span class="ico">☰</span>Menu';
    this.sideEl.addEventListener("click", () => this.showPause(true));
    container.appendChild(this.sideEl);

    this.pauseEl = el("div", "");
    this.pauseEl.className = "scp-pause";
    this.pauseEl.addEventListener("click", (e) => {
      if (e.target === this.pauseEl) this.showPause(false); // backdrop closes
    });
    const pauseCard = document.createElement("div");
    pauseCard.className = "scp";
    const head = document.createElement("div");
    head.className = "scp-head";
    head.textContent = "Captured ships";
    this.tallyEl = document.createElement("div");
    this.tallyEl.innerHTML =
      `<div class="scp-fleet"><span class="scm-dot scm-dot-w"></span>` +
      `<span class="scp-fleet-name">Ivory</span>` +
      `<span class="scp-chips" data-tally-w></span><span class="scp-adv" data-adv-w></span></div>` +
      `<div class="scp-fleet"><span class="scm-dot scm-dot-b"></span>` +
      `<span class="scp-fleet-name">Charcoal</span>` +
      `<span class="scp-chips" data-tally-b></span><span class="scp-adv" data-adv-b></span></div>`;
    this.movesEl = document.createElement("div");
    this.movesEl.className = "scp-log";
    const cmds = document.createElement("div");
    cmds.className = "scp-cmds";
    const mkBtn = (
      icon: string,
      label: string,
      fn: () => void,
      confirmLabel?: string,
    ) => {
      const b = document.createElement("button");
      b.className = "scp-btn";
      const setLabel = (text: string) =>
        (b.innerHTML = `<span class="ico">${icon}</span>${text}`);
      setLabel(label);
      b.title = label;
      let armed = false;
      let timer = 0;
      this.confirmResets.push(() => {
        armed = false;
        setLabel(label);
      });
      b.addEventListener("click", () => {
        // Never window.confirm(): modal dialogs block the page (and any
        // automation). Two-click inline confirm instead.
        if (!confirmLabel || armed) {
          armed = false;
          setLabel(label);
          fn();
          return;
        }
        armed = true;
        setLabel(confirmLabel);
        clearTimeout(timer);
        timer = window.setTimeout(() => {
          armed = false;
          setLabel(label);
        }, 3000);
      });
      cmds.appendChild(b);
    };
    mkBtn("↺", "Undo", () => {
      this.showPause(false);
      this.onUndo?.();
    });
    mkBtn("½", "Draw", () => {
      this.showPause(false);
      this.onOfferDraw?.();
    }, "Agree?");
    mkBtn("⚑", "Resign", () => {
      this.showPause(false);
      this.onResign?.();
    }, "Sure?");
    const resume = document.createElement("button");
    resume.className = "scp-resume";
    resume.textContent = "Resume";
    resume.addEventListener("click", () => this.showPause(false));
    const quit = document.createElement("button");
    quit.className = "scp-quit";
    quit.textContent = "Quit to main menu";
    quit.addEventListener("click", () => {
      this.showPause(false);
      this.onMenu?.();
    });
    pauseCard.append(resume, head, this.tallyEl, this.movesEl, cmds, quit);
    this.pauseEl.appendChild(pauseCard);
    container.appendChild(this.pauseEl);

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
      if (e.key !== "Escape") return;
      if (this.promoEl.style.display !== "none") {
        this.onPromotionCancel?.();
        return;
      }
      // In-game (corner button visible): Escape toggles the pause menu.
      if (this.sideEl.style.display === "flex") {
        this.showPause(this.pauseEl.style.display === "none" || this.pauseEl.style.display === "");
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

    // Main menu — structured DOM styled by the injected stylesheet.
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
      this.pauseEl,
      this.styleEl,
    ]) {
      e.remove();
    }
  }

  showPause(active: boolean): void {
    for (const reset of this.confirmResets) reset();
    this.pauseEl.style.display = active ? "flex" : "none";
  }

  showMenu(active: boolean): void {
    // Armed confirms never leak across games/menus (review P5-10).
    for (const reset of this.confirmResets) reset();
    this.menuEl.style.display = active ? "flex" : "none";
    this.sideEl.style.display = active ? "none" : "flex";
    this.turnEl.style.display = active ? "none" : "block";
    this.pauseEl.style.display = "none";
    if (active) this.overEl.style.display = "none";
  }

  setTurn(color: Color): void {
    this.turnEl.textContent =
      color === "w" ? "Ivory fleet to move" : "Charcoal fleet to move";
  }

  setThinking(active: boolean): void {
    this.thinkingEl.style.display = active ? "block" : "none";
  }

  /** One sync channel: move list + scoreboard from authoritative history. */
  setPosition(sync: PositionSync): void {
    const rows: string[] = [];
    for (let i = 0; i < sync.sanHistory.length; i += 2) {
      rows.push(
        `${i / 2 + 1}. ${sync.sanHistory[i]} ${sync.sanHistory[i + 1] ?? ""}`,
      );
    }
    this.movesEl.textContent = rows.join("\n");
    this.movesEl.scrollTop = this.movesEl.scrollHeight;

    // Each fleet's row shows the ENEMY ships it has captured, as chips in the
    // victim fleet's colors, plus a brass material-advantage badge.
    const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    const chips = (victimColor: Color) =>
      sync.captured
        .filter((c) => c.color === victimColor)
        .map((c) => PIECE_LETTER[c.type] ?? "?")
        .sort()
        .map((l) => `<span class="scp-chip scp-chip-${victimColor}">${l}</span>`)
        .join("");
    const gain = (victimColor: Color) =>
      sync.captured
        .filter((c) => c.color === victimColor)
        .reduce((sum, c) => sum + (VALUE[c.type] ?? 0), 0);
    const q = (sel: string) => this.tallyEl.querySelector(sel) as HTMLElement;
    q("[data-tally-w]").innerHTML = chips("b"); // Ivory captured charcoal ships
    q("[data-tally-b]").innerHTML = chips("w");
    const diff = gain("b") - gain("w"); // >0: Ivory leads on material
    q("[data-adv-w]").textContent = diff > 0 ? `+${diff}` : "";
    q("[data-adv-b]").textContent = diff < 0 ? `+${-diff}` : "";
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
