/**
 * The real admiral: AiPlayer over the vendored Stockfish worker, with the
 * plan's difficulty ladder. Cadet adds an APP-SIDE BLUNDER LAYER (Stockfish's
 * own floor is ~1350 Elo — far above a beginner): with probability
 * BLUNDER_P it plays a uniformly random legal move instead of the engine's.
 * A minimum-delay floor keeps replies from feeling inhuman. On ANY engine
 * failure the caller's contract (GameController) resolves it as the admiral
 * striking colors; a separate MaterialAiPlayer fallback (visibly labeled
 * reduced-strength) is offered when the engine cannot even load.
 */
import { Chess } from "chess.js";
import type { AiPlayer } from "../GameController";
import type { Difficulty } from "../GameController";
import type { PromotionPiece } from "../ChessGame";
import type { EngineTransport, EngineMove } from "./UciClient";
import { PRESETS, UciClient } from "./UciClient";

const MIN_DELAY_MS = 450;
const CADET_BLUNDER_P = 0.35;

/** Browser transport over the vendored engine worker file. */
export function workerTransport(url: string): EngineTransport {
  const worker = new Worker(url);
  return {
    postMessage: (line) => worker.postMessage(line),
    onMessage: (h) =>
      (worker.onmessage = (e: MessageEvent) => h(String(e.data))),
    onError: (h) => (worker.onerror = (e) => h(e)),
    terminate: () => worker.terminate(),
  };
}

export class StockfishAiPlayer implements AiPlayer {
  private readonly client: UciClient;
  private readonly rng: () => number;
  private initialized: Promise<void> | null = null;
  difficulty: Difficulty = "cadet";

  constructor(transport: EngineTransport, rng: () => number = Math.random) {
    this.client = new UciClient(transport);
    this.rng = rng;
  }

  /** Idempotent lazy handshake (kicked off at difficulty selection). */
  ensureReady(): Promise<void> {
    this.initialized ??= this.client.init();
    return this.initialized;
  }

  newGame(): Promise<void> {
    return this.client.newGame();
  }

  stop(): void {
    this.client.stop();
  }

  dispose(): void {
    this.client.dispose();
  }

  async requestMove(fen: string): Promise<{
    from: string;
    to: string;
    promotion?: PromotionPiece;
  }> {
    await this.ensureReady();
    const started = Date.now();
    let move: EngineMove;
    if (this.difficulty === "cadet" && this.rng() < CADET_BLUNDER_P) {
      const chess = new Chess(fen);
      const moves = chess.moves({ verbose: true });
      const m = moves[Math.floor(this.rng() * moves.length)];
      move = {
        from: m.from,
        to: m.to,
        promotion: m.promotion ? "q" : undefined,
      };
    } else {
      move = await this.client.search(fen, PRESETS[this.difficulty]);
    }
    const elapsed = Date.now() - started;
    if (elapsed < MIN_DELAY_MS) {
      await new Promise((r) => setTimeout(r, MIN_DELAY_MS - elapsed));
    }
    return move;
  }
}

/**
 * Fallback when the engine cannot load: 2-ply material search over chess.js
 * movegen (chess.js stays the sole rules authority — no second rules engine).
 * Deliberately labeled reduced-strength by the caller.
 */
export class MaterialAiPlayer implements AiPlayer {
  private readonly rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  async requestMove(fen: string): Promise<{
    from: string;
    to: string;
    promotion?: PromotionPiece;
  }> {
    await new Promise((r) => setTimeout(r, MIN_DELAY_MS));
    const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    const material = (c: Chess, color: "w" | "b") => {
      let sum = 0;
      for (const row of c.board()) {
        for (const sq of row) {
          if (sq) sum += (sq.color === color ? 1 : -1) * VALUE[sq.type];
        }
      }
      return sum;
    };
    const chess = new Chess(fen);
    const me = chess.turn();
    let best: { from: string; to: string; promotion?: string } | null = null;
    let bestScore = -Infinity;
    for (const m of chess.moves({ verbose: true })) {
      chess.move(m);
      let score: number;
      if (chess.isCheckmate()) {
        score = 1000; // I delivered mate
      } else {
        const replies = chess.moves({ verbose: true });
        if (replies.length === 0) {
          score = 0; // stalemate
        } else {
          // Opponent minimizes my material with their best reply (ply 2).
          score = Infinity;
          for (const r of replies) {
            chess.move(r);
            score = Math.min(
              score,
              chess.isCheckmate() ? -1000 : material(chess, me),
            );
            chess.undo();
          }
        }
      }
      chess.undo();
      if (score > bestScore || (score === bestScore && this.rng() < 0.5)) {
        bestScore = score;
        best = m;
      }
    }
    if (!best) throw new Error("no legal moves");
    return {
      from: best.from,
      to: best.to,
      promotion: best.promotion ? "q" : undefined,
    };
  }
}
