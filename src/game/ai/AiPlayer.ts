/**
 * The AI seam. Phase 6 replaces StubAiPlayer with the Stockfish UCI client
 * (vendored lite single-threaded build in public/engine/, request-id
 * lifecycle per the plan) behind this same interface.
 */
import { Chess } from "chess.js";
import type { AiPlayer } from "../GameController";
import type { PromotionPiece } from "../ChessGame";

/** Plays a uniformly random legal move after a short, human-ish pause. */
export class StubAiPlayer implements AiPlayer {
  private readonly delayMs: number;

  constructor(delayMs = 700) {
    this.delayMs = delayMs;
  }

  async requestMove(fen: string): Promise<{
    from: string;
    to: string;
    promotion?: PromotionPiece;
  }> {
    await new Promise((r) => setTimeout(r, this.delayMs));
    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) throw new Error("no legal moves");
    const m = moves[Math.floor(Math.random() * moves.length)];
    return {
      from: m.from,
      to: m.to,
      promotion: m.promotion ? "q" : undefined,
    };
  }
}
