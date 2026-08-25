/**
 * chess.js wrapper — the ONLY module that touches the rules library. Emits a
 * single composite AppliedMove per chess move carrying every sub-effect the
 * scene needs (en passant's real captured square, castling's rook leg,
 * promotion piece), so the render side never re-derives rules.
 *
 * chess.js v1 API notes honored here: move() THROWS on illegal input, so all
 * moves are gated through the legal-destination set; fifty-move and threefold
 * are auto-detected (no claim mechanism); isDraw() includes stalemate, so end
 * states are labeled through the ORDERED check in endState().
 */
import { Chess, type Square } from "chess.js";

export type Color = "w" | "b";
export type Piece = "p" | "n" | "b" | "r" | "q" | "k";
export type PromotionPiece = "q" | "r" | "b" | "n";

export interface AppliedMove {
  color: Color;
  piece: Piece;
  from: string;
  to: string;
  san: string;
  /** Square of the captured ship — for en passant this is NOT `to`. */
  capturedSquare?: string;
  capturedPiece?: Piece;
  /** Castling: the rook's leg, to animate both ships simultaneously. */
  rookFrom?: string;
  rookTo?: string;
  promotedTo?: PromotionPiece;
  /** The side now in check (the mover's opponent), if any. */
  checkedColor?: Color;
  /** FEN after the move — the scene's teleport/undo sync target. */
  fenAfter: string;
  end?: EndState;
}

export interface EndState {
  kind:
    | "checkmate"
    | "stalemate"
    | "threefold"
    | "fifty-move"
    | "insufficient-material";
  /** Winner on checkmate; undefined for draws. */
  winner?: Color;
}

export class ChessGame {
  private chess: Chess;

  constructor(fen?: string) {
    this.chess = fen ? new Chess(fen) : new Chess();
  }

  turn(): Color {
    return this.chess.turn();
  }

  fen(): string {
    return this.chess.fen();
  }

  pieceAt(square: string): { type: Piece; color: Color } | null {
    return this.chess.get(square as Square) ?? null;
  }

  /** Legal destination squares for the piece on `square`. */
  legalDestinations(square: string): string[] {
    return this.chess
      .moves({ square: square as Square, verbose: true })
      .map((m) => m.to);
  }

  /** Does from→to require a promotion choice before it can be committed? */
  isPromotion(from: string, to: string): boolean {
    return this.chess
      .moves({ square: from as Square, verbose: true })
      .some((m) => m.to === to && m.isPromotion());
  }

  /**
   * Apply a move already known to be legal (gate via legalDestinations).
   * Returns the composite AppliedMove.
   */
  applyMove(from: string, to: string, promotion?: PromotionPiece): AppliedMove {
    const m = this.chess.move({ from, to, promotion });
    const applied: AppliedMove = {
      color: m.color,
      piece: m.piece,
      from: m.from,
      to: m.to,
      san: m.san,
      fenAfter: this.chess.fen(),
    };
    if (m.isEnPassant()) {
      // Victim pawn sits on (to-file, from-rank), never on `to`.
      applied.capturedSquare = m.to[0] + m.from[1];
      applied.capturedPiece = "p";
    } else if (m.captured) {
      applied.capturedSquare = m.to;
      applied.capturedPiece = m.captured;
    }
    if (m.isKingsideCastle()) {
      const rank = m.color === "w" ? "1" : "8";
      applied.rookFrom = "h" + rank;
      applied.rookTo = "f" + rank;
    } else if (m.isQueensideCastle()) {
      const rank = m.color === "w" ? "1" : "8";
      applied.rookFrom = "a" + rank;
      applied.rookTo = "d" + rank;
    }
    if (m.promotion) applied.promotedTo = m.promotion as PromotionPiece;
    if (this.chess.inCheck()) applied.checkedColor = this.chess.turn();
    const end = this.endState();
    if (end) applied.end = end;
    return applied;
  }

  /**
   * Ordered end-state labeling — never bare isDraw(), which lumps stalemate
   * with the material/repetition draws.
   */
  endState(): EndState | null {
    if (this.chess.isCheckmate()) {
      return {
        kind: "checkmate",
        winner: this.chess.turn() === "w" ? "b" : "w",
      };
    }
    if (this.chess.isStalemate()) return { kind: "stalemate" };
    if (this.chess.isThreefoldRepetition()) return { kind: "threefold" };
    if (this.chess.isDrawByFiftyMoves()) return { kind: "fifty-move" };
    if (this.chess.isInsufficientMaterial())
      return { kind: "insufficient-material" };
    return null;
  }
}
