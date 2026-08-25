/**
 * Minimal FEN piece-placement parser. The scene layer needs only "which piece
 * sits on which square" — keeping this tiny and dependency-free preserves the
 * plan's hard boundary (chess.js stays in game/; scene/ renders positions).
 */
export type PieceColor = "w" | "b";

export interface PlacedPiece {
  square: string; // "e4"
  type: "p" | "n" | "b" | "r" | "q" | "k";
  color: PieceColor;
}

export const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const FILES = "abcdefgh";

/** Parse the placement field of a FEN string into a list of placed pieces. */
export function parseFenPlacement(fen: string): PlacedPiece[] {
  const placement = fen.trim().split(/\s+/)[0];
  const ranks = placement.split("/");
  if (ranks.length !== 8) throw new Error(`bad FEN placement: ${placement}`);
  const out: PlacedPiece[] = [];
  ranks.forEach((rankStr, i) => {
    const rank = 8 - i;
    let file = 0;
    for (const ch of rankStr) {
      if (ch >= "1" && ch <= "8") {
        file += Number(ch);
      } else {
        const lower = ch.toLowerCase();
        if (!"pnbrqk".includes(lower) || file > 7) {
          throw new Error(`bad FEN piece '${ch}' in rank ${rank}`);
        }
        out.push({
          square: FILES[file] + rank,
          type: lower as PlacedPiece["type"],
          color: ch === lower ? "b" : "w",
        });
        file++;
      }
    }
    if (file !== 8) throw new Error(`bad FEN rank length: ${rankStr}`);
  });
  return out;
}
