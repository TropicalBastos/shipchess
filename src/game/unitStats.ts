/**
 * Per-unit service records, derived from authoritative verbose history on
 * every position change (never accumulated separately — the same discipline
 * as capturedPieces, P4-08): survives undo, reset, and rematch by
 * construction. Keyed by the square the unit currently occupies.
 */

export interface UnitStats {
  /** Cumulative tiles sailed (Chebyshev distance per sortie). */
  tiles: number;
  /** Moves made. */
  sorties: number;
  /** Captures made. */
  battles: number;
}

interface HistoryMove {
  from: string;
  to: string;
  captured?: string;
  flags: string;
}

const dist = (a: string, b: string): number =>
  Math.max(
    Math.abs(a.charCodeAt(0) - b.charCodeAt(0)),
    Math.abs(Number(a[1]) - Number(b[1])),
  );

export function computeUnitStats(
  history: HistoryMove[],
): Map<string, UnitStats> {
  const map = new Map<string, UnitStats>();
  const take = (sq: string): UnitStats => {
    const s = map.get(sq) ?? { tiles: 0, sorties: 0, battles: 0 };
    map.delete(sq);
    return s;
  };
  for (const m of history) {
    // The victim leaves the ledger first (en passant victims are not on m.to).
    if (m.captured) {
      map.delete(m.flags.includes("e") ? m.to[0] + m.from[1] : m.to);
    }
    const s = take(m.from);
    s.tiles += dist(m.from, m.to);
    s.sorties += 1;
    if (m.captured) s.battles += 1;
    map.set(m.to, s);
    // Castling relocates the rook in the same turn.
    if (m.flags.includes("k") || m.flags.includes("q")) {
      const rank = m.from[1];
      const kingside = m.flags.includes("k");
      const rookFrom = (kingside ? "h" : "a") + rank;
      const rookTo = (kingside ? "f" : "d") + rank;
      const rs = take(rookFrom);
      rs.tiles += dist(rookFrom, rookTo);
      rs.sorties += 1;
      map.set(rookTo, rs);
    }
  }
  return map;
}
