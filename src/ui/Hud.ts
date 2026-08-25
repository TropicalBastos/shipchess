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
      "max-height:38vh;overflow-y:auto;line-height:1.6;font:12px ui-monospace,monospace",
    );
    const cmds = el("div", "display:flex;flex-wrap:wrap;gap:6px");
    const mkBtn = (label: string, fn: () => void, confirmLabel?: string) => {
      const b = el("button", BTN + ";padding:5px 8px;font-size:12px", label);
      let armed = false;
      let timer = 0;
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

    // Main menu.
    this.menuEl = el(
      "div",
      "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;" +
        "background:transparent;z-index:25;flex-direction:column;gap:18px;color:#f2f0e6",
    );
    const title = el(
      "div",
      "font:700 44px system-ui;letter-spacing:.06em;text-shadow:0 2px 12px rgba(4,12,18,.8)",
      "ShipChess",
    );
    const menuCard = el(
      "div",
      "background:rgba(10,26,36,.72);border:1px solid #2a4a58;border-radius:12px;" +
        "padding:20px 24px;display:flex;flex-direction:column;gap:12px;font:14px system-ui;" +
        "align-items:stretch;min-width:260px",
    );
    const two = el("button", BTN + ";font-size:16px", "Two Players — hotseat");
    two.addEventListener("click", () => this.onStartGame?.({ aiColor: null }));

    const oneRow = el("div", "display:flex;flex-direction:column;gap:8px");
    const oneLabel = el("div", "opacity:.85", "One Player — vs the Admiral");
    const fleetSel = document.createElement("select");
    fleetSel.style.cssText = BTN;
    fleetSel.innerHTML =
      '<option value="w">Command the Ivory fleet</option>' +
      '<option value="b">Command the Charcoal fleet</option>';
    const diffSel = document.createElement("select");
    diffSel.style.cssText = BTN;
    diffSel.innerHTML =
      '<option value="cadet">Cadet</option><option value="captain">Captain</option>' +
      '<option value="admiral">Admiral</option><option value="fleet">Fleet Admiral</option>';
    const oneStart = el("button", BTN, "Set sail (practice stub AI)");
    oneStart.addEventListener("click", () =>
      this.onStartGame?.({
        aiColor: fleetSel.value === "w" ? "b" : "w",
      }),
    );
    oneRow.append(oneLabel, fleetSel, diffSel, oneStart);

    const fast = document.createElement("label");
    fast.style.cssText = "display:flex;gap:8px;align-items:center;opacity:.9";
    const fastCb = document.createElement("input");
    fastCb.type = "checkbox";
    fastCb.checked = settings.fastAnimations;
    fastCb.addEventListener("change", () => {
      settings.fastAnimations = fastCb.checked;
      this.onSettingsChange?.(settings);
    });
    fast.append(fastCb, document.createTextNode("Fast animations"));

    menuCard.append(two, oneRow, fast);
    this.menuEl.append(title, menuCard);
    container.appendChild(this.menuEl);
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
    ]) {
      e.remove();
    }
  }

  showMenu(active: boolean): void {
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
