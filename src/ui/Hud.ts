/**
 * Minimal Phase 3 HUD: turn indicator, promotion picker, game-over banner.
 * The full menu/move-list/settings surfaces arrive in Phase 5.
 */
import type { Color, EndState, PromotionPiece } from "../game/ChessGame";

const SHIP_NAMES: Record<PromotionPiece, string> = {
  q: "Carrier",
  r: "Battleship",
  b: "Frigate",
  n: "Submarine",
};

const END_TEXT: Record<EndState["kind"], string> = {
  checkmate: "Checkmate",
  stalemate: "Stalemate — both fleets hold station",
  threefold: "Draw — threefold repetition",
  "fifty-move": "Draw — fifty quiet moves",
  "insufficient-material": "Draw — insufficient firepower",
};

export class Hud {
  private readonly turnEl: HTMLDivElement;
  private readonly promoEl: HTMLDivElement;
  private readonly overEl: HTMLDivElement;
  private escHandler!: (e: KeyboardEvent) => void;
  onPromotionPick: ((p: PromotionPiece) => void) | null = null;
  onPromotionCancel: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.turnEl = document.createElement("div");
    this.turnEl.style.cssText =
      "position:fixed;top:8px;left:50%;transform:translateX(-50%);color:#f2f0e6;" +
      "background:rgba(10,26,36,.55);font:14px system-ui;padding:4px 14px;" +
      "border-radius:14px;z-index:10;letter-spacing:.04em";
    container.appendChild(this.turnEl);

    this.promoEl = document.createElement("div");
    this.promoEl.style.cssText =
      "position:fixed;inset:0;display:none;align-items:center;justify-content:center;" +
      "background:rgba(4,12,18,.45);z-index:20";
    const card = document.createElement("div");
    card.style.cssText =
      "background:#10222b;border:1px solid #2a4a58;border-radius:10px;padding:18px;" +
      "display:flex;gap:10px;flex-direction:column;align-items:center;color:#dce7ea;" +
      "font:15px system-ui";
    card.appendChild(
      Object.assign(document.createElement("div"), {
        textContent: "Promote to…",
      }),
    );
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px";
    (Object.keys(SHIP_NAMES) as PromotionPiece[]).forEach((p) => {
      const b = document.createElement("button");
      b.textContent = SHIP_NAMES[p];
      b.style.cssText =
        "background:#1d3947;color:#e9ece4;border:1px solid #3e6878;border-radius:6px;" +
        "padding:8px 12px;font:14px system-ui;cursor:pointer";
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

    this.overEl = document.createElement("div");
    this.overEl.style.cssText =
      "position:fixed;inset:0;display:none;align-items:center;justify-content:center;" +
      "background:rgba(4,12,18,.5);z-index:30;flex-direction:column;gap:14px;" +
      "color:#f2f0e6;font:600 26px system-ui;text-align:center";
    container.appendChild(this.overEl);
  }

  /** Remove global listeners + DOM (needed once Phase 5 rebuilds the HUD). */
  dispose(): void {
    window.removeEventListener("keydown", this.escHandler);
    this.turnEl.remove();
    this.promoEl.remove();
    this.overEl.remove();
  }

  setTurn(color: Color): void {
    this.turnEl.textContent =
      color === "w" ? "Ivory fleet to move" : "Charcoal fleet to move";
  }

  showPromotion(active: boolean): void {
    this.promoEl.style.display = active ? "flex" : "none";
  }

  showGameOver(end: EndState): void {
    const winner =
      end.kind === "checkmate"
        ? end.winner === "w"
          ? " — the Ivory fleet prevails"
          : " — the Charcoal fleet prevails"
        : "";
    this.overEl.innerHTML = "";
    this.overEl.appendChild(
      Object.assign(document.createElement("div"), {
        textContent: END_TEXT[end.kind] + winner,
      }),
    );
    const again = document.createElement("button");
    again.textContent = "New game";
    again.style.cssText =
      "background:#1d3947;color:#e9ece4;border:1px solid #3e6878;border-radius:6px;" +
      "padding:10px 18px;font:15px system-ui;cursor:pointer";
    again.addEventListener("click", () => location.reload()); // Phase 5: real loop
    this.overEl.appendChild(again);
    this.overEl.style.display = "flex";
  }
}
