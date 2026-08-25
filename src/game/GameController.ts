/**
 * THE single state authority. All commands — board picks and (later) HUD
 * buttons — route through here and are gated by state. The Animator is a pure
 * consumer: play(move) returns a promise and owns no game state; the game
 * does not advance to the next actor until it resolves. Phase 3's animator
 * implementation is a teleport that resolves immediately; Phase 4 swaps the
 * implementation, not these seams.
 */
import type {
  AppliedMove,
  ChessGame,
  Color,
  EndState,
  PromotionPiece,
} from "./ChessGame";

export type { EndState } from "./ChessGame";

export type GameState =
  | "awaitingInput"
  | "animating"
  | "awaitingPromotion"
  | "gameOver";
// menu | aiThinking | loading join in Phases 5–6.

export interface MoveAnimator {
  play(move: AppliedMove): Promise<void>;
}

export interface GameView {
  /** Selection changed: selected square (or null) + its legal destinations. */
  onSelection(square: string | null, legalDestinations: string[]): void;
  /** An attempted move was illegal — show a denial cue on the square. */
  onDenied(square: string): void;
  onCheck(color: Color | null): void;
  onTurn(color: Color): void;
  onPromotionPrompt(active: boolean): void;
  onGameOver(end: EndState): void;
}

export class GameController {
  private state: GameState = "awaitingInput";
  private selected: string | null = null;
  private legal: string[] = [];
  private pending: { from: string; to: string } | null = null;

  private readonly game: ChessGame;
  private readonly animator: MoveAnimator;
  private readonly view: GameView;

  constructor(game: ChessGame, animator: MoveAnimator, view: GameView) {
    this.game = game;
    this.animator = animator;
    this.view = view;
    this.view.onTurn(this.game.turn());
  }

  currentState(): GameState {
    return this.state;
  }

  /** Board click on a square (or off-board: null) — the ONLY input entry. */
  async clickSquare(square: string | null): Promise<void> {
    if (this.state !== "awaitingInput") return; // input rejected mid-flow
    if (square === null) {
      this.deselect();
      return;
    }
    const piece = this.game.pieceAt(square);
    if (this.selected && this.legal.includes(square)) {
      await this.beginMove(this.selected, square);
      return;
    }
    if (piece && piece.color === this.game.turn()) {
      this.selected = square;
      this.legal = this.game.legalDestinations(square);
      this.view.onSelection(square, this.legal);
      return;
    }
    if (this.selected) {
      // Clicked neither a legal destination nor an own piece.
      this.view.onDenied(square);
      this.deselect();
    }
  }

  private deselect(): void {
    this.selected = null;
    this.legal = [];
    this.view.onSelection(null, []);
  }

  private async beginMove(from: string, to: string): Promise<void> {
    if (this.game.isPromotion(from, to)) {
      this.pending = { from, to };
      this.state = "awaitingPromotion";
      this.view.onPromotionPrompt(true);
      return;
    }
    await this.commit(from, to);
  }

  /** Promotion picker resolution. */
  async choosePromotion(piece: PromotionPiece): Promise<void> {
    if (this.state !== "awaitingPromotion" || !this.pending) return;
    const { from, to } = this.pending;
    this.pending = null;
    this.view.onPromotionPrompt(false);
    await this.commit(from, to, piece);
  }

  /** Defined cancel: pending move cleared, ship stays put, back to input. */
  cancelPromotion(): void {
    if (this.state !== "awaitingPromotion") return;
    this.pending = null;
    this.state = "awaitingInput";
    this.view.onPromotionPrompt(false);
    this.deselect();
  }

  private async commit(
    from: string,
    to: string,
    promotion?: PromotionPiece,
  ): Promise<void> {
    this.deselect();
    this.state = "animating";
    const move = this.game.applyMove(from, to, promotion);
    try {
      await this.animator.play(move);
    } catch (err) {
      // The rules position is authoritative and already advanced; a failed
      // animation must never strand the game in `animating`. Log and proceed —
      // the next sync repaints the fleet. (Phase 4 may refine this policy.)
      console.error("animator.play failed; continuing with committed move", err);
    }
    // Transition FIRST, notify after: a throwing view callback must never
    // strand the controller in `animating` (round-2 review R2-02).
    this.state = move.end ? "gameOver" : "awaitingInput";
    try {
      this.view.onCheck(move.checkedColor ?? null);
      if (move.end) this.view.onGameOver(move.end);
      else this.view.onTurn(this.game.turn());
    } catch (err) {
      console.error("view callback failed after committed move", err);
    }
  }
}
