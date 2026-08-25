import { describe, expect, it } from "vitest";
import { ChessGame } from "./ChessGame";
import type { AppliedMove } from "./ChessGame";
import { GameController } from "./GameController";
import type { EndState, GameView } from "./GameController";

describe("ChessGame event mapping", () => {
  it("kingside castling carries the rook leg (both colors)", () => {
    const g = new ChessGame(
      "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1",
    );
    const w = g.applyMove("e1", "g1");
    expect(w).toMatchObject({ rookFrom: "h1", rookTo: "f1", san: "O-O" });
    const b = g.applyMove("e8", "c8");
    expect(b).toMatchObject({ rookFrom: "a8", rookTo: "d8", san: "O-O-O" });
  });

  it("en passant captures the pawn NOT on the destination square", () => {
    const g = new ChessGame();
    g.applyMove("e2", "e4");
    g.applyMove("a7", "a6");
    g.applyMove("e4", "e5");
    g.applyMove("d7", "d5");
    const ep = g.applyMove("e5", "d6"); // exd6 e.p.
    expect(ep.capturedSquare).toBe("d5");
    expect(ep.to).toBe("d6");
    expect(ep.capturedPiece).toBe("p");
  });

  it("promotion-with-capture composes all three effects in one event", () => {
    const g = new ChessGame("rn2k3/1P6/8/8/8/8/8/4K3 w q - 0 1");
    expect(g.isPromotion("b7", "a8")).toBe(true);
    const m = g.applyMove("b7", "a8", "q");
    expect(m).toMatchObject({
      capturedSquare: "a8",
      capturedPiece: "r",
      promotedTo: "q",
    });
  });

  it("normal captures report the destination as the captured square", () => {
    const g = new ChessGame();
    g.applyMove("e2", "e4");
    g.applyMove("d7", "d5");
    const m = g.applyMove("e4", "d5");
    expect(m.capturedSquare).toBe("d5");
  });

  it("check is attributed to the mover's opponent", () => {
    const g = new ChessGame("4k3/8/8/8/8/8/8/4K2R w - - 0 1");
    const m = g.applyMove("h1", "h8");
    expect(m.checkedColor).toBe("b");
  });

  it("labels end states in the correct order (never bare isDraw)", () => {
    // Checkmate (fool's mate) — winner black.
    const mate = new ChessGame();
    mate.applyMove("f2", "f3");
    mate.applyMove("e7", "e5");
    mate.applyMove("g2", "g4");
    const final = mate.applyMove("d8", "h4");
    expect(final.end).toEqual({ kind: "checkmate", winner: "b" });

    // Stalemate must NOT be labeled a material/repetition draw.
    const stale = new ChessGame("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(stale.endState()).toEqual({ kind: "stalemate" });

    // Insufficient material (K vs K).
    const bare = new ChessGame("8/8/4k3/8/8/4K3/8/8 w - - 0 1");
    expect(bare.endState()).toEqual({ kind: "insufficient-material" });

    // Fifty-move: halfmove clock reaches 100 after a quiet move.
    const fifty = new ChessGame("4k3/8/8/8/8/8/8/4K2R w - - 99 80");
    const m = fifty.applyMove("h1", "h2");
    expect(m.end).toEqual({ kind: "fifty-move" });
  });

  it("threefold repetition is detected", () => {
    const g = new ChessGame();
    for (let i = 0; i < 2; i++) {
      g.applyMove("g1", "f3");
      g.applyMove("g8", "f6");
      g.applyMove("f3", "g1");
      g.applyMove("f6", "g8");
    }
    expect(g.endState()).toEqual({ kind: "threefold" });
  });

  it("legalDestinations gates moves (no throw path in normal flow)", () => {
    const g = new ChessGame();
    expect(g.legalDestinations("e2").sort()).toEqual(["e3", "e4"]);
    expect(g.legalDestinations("e4")).toEqual([]); // empty square
    expect(g.legalDestinations("e7")).not.toContain("e5x");
  });
});

function makeView() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calls: Record<string, any[]> = {
    selection: [],
    denied: [],
    check: [],
    turn: [],
    promo: [],
    over: [],
  };
  const view: GameView = {
    onSelection: (sq, legal) => calls.selection.push([sq, legal]),
    onDenied: (sq) => calls.denied.push(sq),
    onCheck: (c) => calls.check.push(c),
    onTurn: (c) => calls.turn.push(c),
    onPromotionPrompt: (a) => calls.promo.push(a),
    onGameOver: (e: EndState) => calls.over.push(e),
  };
  return { view, calls };
}

const instantAnimator = { play: async (_m: AppliedMove) => {} };

describe("GameController state machine", () => {
  it("enforces turn order and rejects opponent selection", async () => {
    const { view, calls } = makeView();
    const gc = new GameController(new ChessGame(), instantAnimator, view);
    await gc.clickSquare("e7"); // black pawn, white to move
    expect(calls.selection).toHaveLength(0);
    await gc.clickSquare("e2");
    expect(calls.selection.at(-1)).toEqual(["e2", ["e3", "e4"]]);
  });

  it("plays a move, flips the turn, denies illegal targets", async () => {
    const { view, calls } = makeView();
    const gc = new GameController(new ChessGame(), instantAnimator, view);
    await gc.clickSquare("e2");
    await gc.clickSquare("e4");
    expect(calls.turn).toEqual(["w", "b"]);
    await gc.clickSquare("e7");
    await gc.clickSquare("e2"); // not legal for the e7 pawn
    expect(calls.denied).toEqual(["e2"]);
    expect(gc.currentState()).toBe("awaitingInput");
  });

  it("rejects all input while animating", async () => {
    const { view, calls } = makeView();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const gc = new GameController(
      new ChessGame(),
      { play: () => gate },
      view,
    );
    await gc.clickSquare("e2");
    const moving = gc.clickSquare("e4"); // enters animating, blocked on gate
    await Promise.resolve();
    expect(gc.currentState()).toBe("animating");
    await gc.clickSquare("d2"); // must be swallowed
    expect(calls.selection.filter(([s]) => s === "d2")).toHaveLength(0);
    release();
    await moving;
    expect(gc.currentState()).toBe("awaitingInput");
  });

  it("promotion: prompts, commits a choice, and cancel restores input", async () => {
    const { view, calls } = makeView();
    const game = new ChessGame("4k3/1P6/8/8/8/8/8/4K3 w - - 0 1");
    const gc = new GameController(game, instantAnimator, view);
    await gc.clickSquare("b7");
    await gc.clickSquare("b8");
    expect(gc.currentState()).toBe("awaitingPromotion");
    expect(calls.promo).toEqual([true]);
    gc.cancelPromotion();
    expect(gc.currentState()).toBe("awaitingInput");
    expect(game.pieceAt("b7")).toEqual({ type: "p", color: "w" });
    await gc.clickSquare("b7");
    await gc.clickSquare("b8");
    await gc.choosePromotion("n"); // underpromotion offered and honored
    expect(game.pieceAt("b8")).toEqual({ type: "n", color: "w" });
  });

  it("reaches gameOver on mate and rejects further input", async () => {
    const { view, calls } = makeView();
    const gc = new GameController(new ChessGame(), instantAnimator, view);
    for (const [f, t] of [
      ["f2", "f3"],
      ["e7", "e5"],
      ["g2", "g4"],
      ["d8", "h4"],
    ]) {
      await gc.clickSquare(f);
      await gc.clickSquare(t);
    }
    expect(gc.currentState()).toBe("gameOver");
    expect(calls.over).toEqual([{ kind: "checkmate", winner: "b" }]);
    await gc.clickSquare("e2");
    expect(calls.selection.at(-1)).toEqual([null, []]); // only deselects logged
  });
});
