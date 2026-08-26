import { describe, expect, it } from "vitest";
import { ChessGame } from "./ChessGame";
import { computeUnitStats } from "./unitStats";

describe("unit service records", () => {
  it("tracks tiles, sorties, and battles through moves and captures", () => {
    const g = new ChessGame();
    g.applyMove("e2", "e4"); // pawn: 2 tiles
    g.applyMove("d7", "d5");
    g.applyMove("e4", "d5"); // pawn captures: +1 tile, battle won
    const stats = computeUnitStats(g.verboseHistory());
    expect(stats.get("d5")).toEqual({ tiles: 3, sorties: 2, battles: 1 });
    expect(stats.get("e2")).toBeUndefined(); // vacated
  });

  it("castling credits the rook's relocation", () => {
    const g = new ChessGame();
    for (const [f, t] of [
      ["e2", "e4"], ["e7", "e5"],
      ["g1", "f3"], ["b8", "c6"],
      ["f1", "c4"], ["g8", "f6"],
      ["e1", "g1"], // white castles kingside
    ]) {
      g.applyMove(f, t);
    }
    const stats = computeUnitStats(g.verboseHistory());
    expect(stats.get("g1")).toEqual({ tiles: 2, sorties: 1, battles: 0 }); // king
    expect(stats.get("f1")).toEqual({ tiles: 2, sorties: 1, battles: 0 }); // rook
  });

  it("en passant removes the true victim square from the ledger", () => {
    const g = new ChessGame();
    g.applyMove("e2", "e4");
    g.applyMove("a7", "a6");
    g.applyMove("e4", "e5");
    g.applyMove("d7", "d5");
    g.applyMove("e5", "d6"); // en passant: victim was on d5
    const stats = computeUnitStats(g.verboseHistory());
    expect(stats.get("d6")).toEqual({ tiles: 4, sorties: 3, battles: 1 });
    expect(stats.get("d5")).toBeUndefined();
  });

  it("undo is handled by construction (recompute from shorter history)", () => {
    const g = new ChessGame();
    g.applyMove("e2", "e4");
    g.applyMove("e7", "e5");
    g.undoPlies(1);
    const stats = computeUnitStats(g.verboseHistory());
    expect(stats.get("e4")).toEqual({ tiles: 2, sorties: 1, battles: 0 });
    expect(stats.get("e5")).toBeUndefined();
  });
});
