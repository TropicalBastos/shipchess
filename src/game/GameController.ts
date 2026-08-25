/**
 * THE single state authority. All commands — board picks and HUD buttons —
 * route through here and are gated by state. The Animator is a pure consumer:
 * play(move) returns a promise and owns no game state; the game does not
 * advance to the next actor until it resolves.
 *
 * Phase 5: menu / rematch loop, undo (FEN rebuild, never incremental),
 * resign, draw by agreement, and the AI seam (aiThinking) behind AiPlayer —
 * Phase 6 swaps the stub for Stockfish without touching these seams.
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
  | "menu"
  | "awaitingInput"
  | "animating"
  | "awaitingPromotion"
  | "aiThinking"
  | "gameOver";

export interface MoveAnimator {
  play(move: AppliedMove): Promise<void>;
}

/** Phase 6 implements this over Stockfish; Phase 5 ships a stub. */
export interface AiPlayer {
  requestMove(fen: string): Promise<{
    from: string;
    to: string;
    promotion?: PromotionPiece;
  }>;
}

export type Difficulty = "cadet" | "captain" | "admiral" | "fleet";

export interface GameConfig {
  /** null = hotseat; otherwise the color the AI commands. */
  aiColor: Color | null;
  /** Carried through to the AI seam; the Phase 6 engine maps it to presets.
   * The Phase 5 stub ignores it. */
  difficulty?: Difficulty;
}

export interface GameView {
  onSelection(square: string | null, legalDestinations: string[]): void;
  onDenied(square: string): void;
  onCheck(color: Color | null): void;
  onTurn(color: Color): void;
  onPromotionPrompt(active: boolean): void;
  onGameOver(end: EndState): void;
  /** Authoritative position/history sync: fires after every move, undo,
   * new game, and menu return — the ONE channel HUD + tally listen on. */
  onPosition(sync: PositionSync): void;
  onAiThinking(active: boolean): void;
}

export interface PositionSync {
  fen: string;
  sanHistory: string[];
  captured: Array<{ type: string; color: Color }>;
  inMenu: boolean;
  /** "move": the animator already reconciled the fleet — do NOT re-sync
   * (it would cancel the promotion-rise beat). "reset": rebuild the fleet. */
  reason: "move" | "reset";
}

export class GameController {
  private state: GameState = "menu";
  private selected: string | null = null;
  private legal: string[] = [];
  private pending: { from: string; to: string } | null = null;
  private config: GameConfig = { aiColor: null };
  private aiGeneration = 0;

  private readonly game: ChessGame;
  private readonly animator: MoveAnimator;
  private readonly view: GameView;
  private readonly ai: AiPlayer | null;

  constructor(
    game: ChessGame,
    animator: MoveAnimator,
    view: GameView,
    ai: AiPlayer | null = null,
  ) {
    this.game = game;
    this.animator = animator;
    this.view = view;
    this.ai = ai;
    this.syncPosition();
  }

  currentState(): GameState {
    return this.state;
  }

  /** Invalidate any pending AI reply and hide the thinking cue (P5-05). */
  private cancelAi(): void {
    this.aiGeneration++;
    this.view.onAiThinking(false);
  }

  private syncPosition(reason: "move" | "reset" = "reset"): void {
    this.view.onPosition({
      fen: this.game.fen(),
      sanHistory: this.game.sanHistory(),
      captured: this.game.capturedPieces(),
      inMenu: this.state === "menu",
      reason,
    });
  }

  /** Start a game (from menu or gameOver — the rematch path). Allowed while
   * the AI thinks: the generation bump drops the stale reply (plan Phase 6
   * contract). fresh=false keeps the current position (custom FENs, tests). */
  startGame(config: GameConfig, fresh = true): void {
    if (this.state === "animating") return;
    this.cancelAi();
    this.config = config;
    if (fresh) this.game.reset();
    this.pending = null;
    this.state = "awaitingInput";
    this.deselect();
    this.view.onCheck(null);
    this.syncPosition();
    this.view.onTurn(this.game.turn());
    if (config.aiColor === "w") void this.aiMove();
  }

  /** Back to the menu (idle ocean). */
  toMenu(): void {
    if (this.state === "animating") return;
    this.cancelAi();
    this.state = "menu";
    this.deselect();
    this.view.onCheck(null);
    this.syncPosition();
  }

  /** Board click on a square (or off-board: null) — the ONLY board input. */
  async clickSquare(square: string | null): Promise<void> {
    if (this.state !== "awaitingInput") return;
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
      this.view.onDenied(square);
      this.deselect();
    }
  }

  /** Undo: one ply in hotseat, two in AI games (per plan). During aiThinking
   * it takes back just the human ply and cancels the pending reply. Rejected
   * only while animating; disabled when history is insufficient. */
  undo(): void {
    if (this.state === "animating" || this.state === "menu") return;
    if (this.state === "awaitingPromotion") return;
    const plies =
      this.state === "aiThinking" ? 1 : this.config.aiColor ? 2 : 1;
    if (this.game.historyLength() < plies) return;
    this.cancelAi(); // any in-flight AI reply is now stale
    this.game.undoPlies(plies);
    this.deselect();
    this.state = "awaitingInput";
    // Restore the TRUE check state of the rewound position (P5-07).
    this.view.onCheck(this.game.checkedNow());
    this.syncPosition();
    this.view.onTurn(this.game.turn());
    // Rewinding past a terminal human move can leave the AI to move (P5-01).
    if (this.config.aiColor === this.game.turn()) void this.aiMove();
  }

  /** The human side strikes their colors (also legal while the AI thinks —
   * the generation bump drops the pending reply). */
  resign(): void {
    if (this.state !== "awaitingInput" && this.state !== "aiThinking") return;
    const loser = this.config.aiColor
      ? this.config.aiColor === "w"
        ? "b"
        : "w"
      : this.game.turn();
    this.endGame({ kind: "resignation", winner: loser === "w" ? "b" : "w" });
  }

  /** Draw by agreement (the HUD confirms with the opponent in hotseat;
   * Phase 6 adds the AI's accept/decline policy before calling this). */
  agreeDraw(): void {
    if (this.state !== "awaitingInput") return;
    this.endGame({ kind: "agreement" });
  }

  private endGame(end: EndState): void {
    this.cancelAi();
    this.deselect();
    this.state = "gameOver";
    this.view.onGameOver(end);
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

  async choosePromotion(piece: PromotionPiece): Promise<void> {
    if (this.state !== "awaitingPromotion" || !this.pending) return;
    const { from, to } = this.pending;
    this.pending = null;
    this.view.onPromotionPrompt(false);
    await this.commit(from, to, piece);
  }

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
    let played = true;
    try {
      await this.animator.play(move);
    } catch (err) {
      played = false;
      console.error("animator.play failed; continuing with committed move", err);
    }
    this.state = move.end ? "gameOver" : "awaitingInput";
    try {
      // A failed animation never reconciled the fleet — force a rebuild (P5-04).
      this.syncPosition(played ? "move" : "reset");
      this.view.onCheck(move.checkedColor ?? null);
      if (move.end) this.view.onGameOver(move.end);
      else this.view.onTurn(this.game.turn());
    } catch (err) {
      console.error("view callback failed after committed move", err);
    }
    if (
      this.state === "awaitingInput" &&
      this.config.aiColor === this.game.turn()
    ) {
      await this.aiMove();
    }
  }

  private async aiMove(): Promise<void> {
    if (!this.ai || this.state !== "awaitingInput") return;
    const generation = this.aiGeneration;
    this.state = "aiThinking";
    this.view.onAiThinking(true);
    try {
      const reply = await this.ai.requestMove(this.game.fen());
      // Stale replies (undo / new game / menu since the request) are dropped.
      if (generation !== this.aiGeneration || this.state !== "aiThinking") {
        return;
      }
      if (!this.game.legalDestinations(reply.from).includes(reply.to)) {
        throw new Error(`illegal AI move ${reply.from}->${reply.to}`);
      }
      this.state = "awaitingInput";
      await this.commit(reply.from, reply.to, reply.promotion);
    } catch (err) {
      console.error("AI move failed", err);
      // Never hand the AI fleet to the human and never deadlock: the
      // admiral strikes colors (P5-03).
      if (generation === this.aiGeneration && this.state === "aiThinking") {
        const human = this.config.aiColor === "w" ? "b" : "w";
        this.state = "awaitingInput";
        this.endGame({ kind: "resignation", winner: human });
      }
    } finally {
      if (generation === this.aiGeneration) this.view.onAiThinking(false);
    }
  }
}
