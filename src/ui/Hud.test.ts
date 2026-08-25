// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import type { PromotionPiece } from "../game/ChessGame";
import { Hud } from "./Hud";

describe("Hud promotion wiring (DOM)", () => {
  let hud: Hud;
  let picks: PromotionPiece[];
  let cancels: number;

  beforeEach(() => {
    hud?.dispose(); // the leak this test file caught (review M3-09)
    document.body.innerHTML = "";
    hud = new Hud(document.body, { version: 1, fastAnimations: false, cameraGlide: true, volume: 0.8 });
    picks = [];
    cancels = 0;
    hud.onPromotionPick = (p) => picks.push(p);
    hud.onPromotionCancel = () => cancels++;
  });

  const buttons = () =>
    [...document.querySelectorAll("button")].filter((b) =>
      ["Carrier", "Battleship", "Frigate", "Submarine"].includes(
        b.textContent ?? "",
      ),
    );

  it("maps the four ship buttons to the right promotion pieces", () => {
    hud.showPromotion(true);
    const byName = Object.fromEntries(
      buttons().map((b) => [b.textContent, b]),
    );
    byName["Carrier"].click();
    byName["Battleship"].click();
    byName["Frigate"].click();
    byName["Submarine"].click();
    expect(picks).toEqual(["q", "r", "b", "n"]);
    expect(cancels).toBe(0); // clicks must not bubble into backdrop cancel
  });

  it("backdrop click cancels; Escape cancels only while visible", () => {
    hud.showPromotion(true);
    const backdrop = buttons()[0].closest("div")!.parentElement!.parentElement!;
    backdrop.click();
    expect(cancels).toBe(1);
    hud.showPromotion(false);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(cancels).toBe(1); // hidden prompt: Escape is inert
    hud.showPromotion(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(cancels).toBe(2);
  });

  it("all seven end states render distinct banner text with correct winners", () => {
    const cases: Array<[Parameters<typeof hud.showGameOver>[0], string]> = [
      [{ kind: "checkmate", winner: "w" }, "Ivory fleet prevails"],
      [{ kind: "resignation", winner: "b" }, "Charcoal fleet prevails"],
      [{ kind: "resignation", winner: "b" }, "flag is struck"],
      [{ kind: "stalemate" }, "Stalemate"],
      [{ kind: "threefold" }, "threefold"],
      [{ kind: "fifty-move" }, "fifty quiet moves"],
      [{ kind: "insufficient-material" }, "insufficient firepower"],
      [{ kind: "agreement" }, "both admirals agree"],
    ];
    for (const [end, text] of cases) {
      hud.showGameOver(end, () => {}, () => {});
      expect(document.body.textContent).toContain(text);
    }
  });

  it("move list renders numbered pairs incl. an odd final ply", () => {
    hud.setPosition({
      fen: "x",
      sanHistory: ["e4", "e5", "Nf3"],
      captured: [],
      inMenu: false,
      reason: "reset",
    });
    expect(document.body.textContent).toContain("1. e4 e5");
    expect(document.body.textContent).toContain("2. Nf3");
  });

  it("captured tallies render per fleet with piece letters", () => {
    hud.setPosition({
      fen: "x",
      sanHistory: [],
      captured: [
        { type: "p", color: "b" },
        { type: "q", color: "b" },
        { type: "n", color: "w" },
      ],
      inMenu: false,
      reason: "reset",
    });
    const t = document.body.textContent ?? "";
    expect(t).toContain("Ivory prizes");
    expect(t).toMatch(/Ivory prizes:\s*P Q/);
    expect(t).toMatch(/Charcoal prizes:\s*N/);
  });

  it("turn pill and game-over banner render the right text", () => {
    hud.setTurn("w");
    expect(document.body.textContent).toContain("Ivory fleet to move");
    hud.showGameOver({ kind: "stalemate" }, () => {}, () => {});
    expect(document.body.textContent).toContain("Stalemate");
    hud.showGameOver({ kind: "checkmate", winner: "b" }, () => {}, () => {});
    expect(document.body.textContent).toContain("Charcoal fleet prevails");
  });
});
