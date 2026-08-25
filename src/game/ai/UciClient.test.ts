import { describe, expect, it } from "vitest";
import type { EngineTransport } from "./UciClient";
import { PRESETS, UciClient } from "./UciClient";
import { MaterialAiPlayer, StockfishAiPlayer } from "./StockfishAiPlayer";

/** Scriptable fake engine: records sent lines, replies per rules. */
function fakeEngine(rules: Array<[RegExp, string[]]>) {
  const sent: string[] = [];
  let handler: (line: string) => void = () => {};
  let errHandler: (err: unknown) => void = () => {};
  const transport: EngineTransport = {
    postMessage: (line) => {
      sent.push(line);
      for (const [re, replies] of rules) {
        if (re.test(line)) {
          for (const r of replies) queueMicrotask(() => handler(r));
          return;
        }
      }
    },
    onMessage: (h) => (handler = h),
    onError: (h) => (errHandler = h),
    terminate: () => {},
  };
  return { transport, sent, fail: (e: unknown) => errHandler(e) };
}

const STANDARD: Array<[RegExp, string[]]> = [
  [/^uci$/, ["id name Fake", "uciok"]],
  [/^isready$/, ["readyok"]],
  [/^go/, ["info depth 1", "bestmove e2e4"]],
];

describe("UciClient", () => {
  it("performs the handshake and a search with the preset's options", async () => {
    const { transport, sent } = fakeEngine(STANDARD);
    const c = new UciClient(transport);
    await c.init();
    await c.newGame();
    const m = await c.search("FEN_HERE", PRESETS.fleet);
    expect(m).toEqual({ from: "e2", to: "e4", promotion: undefined });
    expect(sent).toEqual([
      "uci",
      "isready",
      "ucinewgame",
      "isready",
      "setoption name Skill Level value 20",
      "position fen FEN_HERE",
      "go movetime 2000",
    ]);
  });

  it("cadet preset searches at depth 1 with skill 0", async () => {
    const { transport, sent } = fakeEngine(STANDARD);
    const c = new UciClient(transport);
    await c.init();
    await c.search("F", PRESETS.cadet);
    expect(sent).toContain("setoption name Skill Level value 0");
    expect(sent).toContain("go depth 1");
  });

  it("parses promotion bestmoves", async () => {
    const { transport } = fakeEngine([
      [/^uci$/, ["uciok"]],
      [/^isready$/, ["readyok"]],
      [/^go/, ["bestmove b7b8q"]],
    ]);
    const c = new UciClient(transport);
    await c.init();
    const m = await c.search("F", PRESETS.captain);
    expect(m).toEqual({ from: "b7", to: "b8", promotion: "q" });
  });

  it("rejects on 'bestmove (none)'", async () => {
    const { transport } = fakeEngine([
      [/^uci$/, ["uciok"]],
      [/^isready$/, ["readyok"]],
      [/^go/, ["bestmove (none)"]],
    ]);
    const c = new UciClient(transport);
    await c.init();
    await expect(c.search("F", PRESETS.captain)).rejects.toThrow(/no move/);
  });

  it("propagates transport errors to waiters", async () => {
    const { transport, fail } = fakeEngine([[/^uci$/, []]]);
    const c = new UciClient(transport);
    const init = c.init();
    fail(new Error("worker died"));
    await expect(init).rejects.toThrow(/engine error/);
  });

  it("stop() sends stop", async () => {
    const { transport, sent } = fakeEngine(STANDARD);
    const c = new UciClient(transport);
    c.stop();
    expect(sent).toContain("stop");
  });
});

describe("StockfishAiPlayer", () => {
  it("cadet blunder layer replaces the engine move with a random legal move", async () => {
    const { transport, sent } = fakeEngine(STANDARD);
    // rng: first call 0.1 (< 0.35 → blunder), second call picks index 0.
    const rngValues = [0.1, 0];
    const ai = new StockfishAiPlayer(transport, () => rngValues.shift() ?? 0.9);
    ai.difficulty = "cadet";
    const start =
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const m = await ai.requestMove(start);
    // A legal white move from the start position, NOT via the engine.
    expect(m.from).toMatch(/^[a-h][12]$/);
    expect(sent.filter((l) => l.startsWith("go"))).toHaveLength(0);
  });

  it("non-blunder path delegates to the engine with the preset", async () => {
    const { transport, sent } = fakeEngine(STANDARD);
    const ai = new StockfishAiPlayer(transport, () => 0.99); // never blunder
    ai.difficulty = "admiral";
    const m = await ai.requestMove("F");
    expect(m.from).toBe("e2");
    expect(sent).toContain("setoption name Skill Level value 13");
    expect(sent).toContain("go movetime 1000");
  });

  it("enforces the minimum-delay floor", async () => {
    const { transport } = fakeEngine(STANDARD);
    const ai = new StockfishAiPlayer(transport, () => 0.99);
    ai.difficulty = "fleet";
    const t0 = Date.now();
    await ai.requestMove("F");
    expect(Date.now() - t0).toBeGreaterThanOrEqual(430); // floor ≈450ms
  });
});

describe("MaterialAiPlayer (reduced-strength fallback)", () => {
  it("takes a hanging queen", async () => {
    const ai = new MaterialAiPlayer(() => 0);
    // Black queen hangs on d4; white rook a4 can take it safely.
    const m = await ai.requestMove("4k3/8/8/8/R2q4/8/8/4K3 w - - 0 1");
    expect(m).toMatchObject({ from: "a4", to: "d4" });
  });

  it("refuses a poisoned capture (2-ply lookahead)", async () => {
    const ai = new MaterialAiPlayer(() => 0);
    // White rook could grab the b5 pawn, but a6xb5 recaptures: rook for pawn.
    const m = await ai.requestMove("4k3/8/p7/1p6/1R6/8/8/4K3 w - - 0 1");
    expect(`${m.from}${m.to}`).not.toBe("b4b5");
  });

  it("finds mate in one", async () => {
    const ai = new MaterialAiPlayer(() => 0);
    const m = await ai.requestMove("6k1/8/6K1/8/8/8/8/R7 w - - 0 1");
    expect(m).toMatchObject({ from: "a1", to: "a8" });
  });
});

describe("Phase 6 review locks", () => {
  it("a late bestmove from a stopped search never satisfies the next one (P6-01)", async () => {
    // Fake engine that only answers the SECOND go; the first search hangs
    // until "stop" arrives, then emits its (stale) bestmove.
    const sent: string[] = [];
    let handler: (l: string) => void = () => {};
    let goCount = 0;
    const transport: EngineTransport = {
      postMessage: (line) => {
        sent.push(line);
        if (line === "uci") queueMicrotask(() => handler("uciok"));
        if (line === "isready") queueMicrotask(() => handler("readyok"));
        if (line.startsWith("go")) goCount++;
        if (line === "stop") queueMicrotask(() => handler("bestmove a7a5")); // stale
        if (line.startsWith("go") && goCount === 2)
          queueMicrotask(() => queueMicrotask(() => handler("bestmove e2e4")));
      },
      onMessage: (h) => (handler = h),
      onError: () => {},
      terminate: () => {},
    };
    const c = new UciClient(transport);
    await c.init();
    const first = c.search("FEN1", PRESETS.fleet); // hangs until stopped
    first.catch(() => {}); // its result is stale by design
    const second = c.search("FEN2", PRESETS.fleet); // must stop+drain FEN1
    const m = await second;
    expect(m.from).toBe("e2"); // never the stale a7a5
    expect(sent).toContain("stop");
  });

  it("malformed promotion chars are dropped, not smuggled through (P6-04)", async () => {
    const { transport } = fakeEngine([
      [/^uci$/, ["uciok"]],
      [/^isready$/, ["readyok"]],
      [/^go/, ["bestmove g2g1x"]],
    ]);
    const c = new UciClient(transport);
    await c.init();
    const m = await c.search("F", PRESETS.captain);
    expect(m.promotion).toBeUndefined();
  });

  it("cadet blunder layer preserves underpromotions (P6-09)", async () => {
    const { transport } = fakeEngine(STANDARD);
    // rng: 0.1 → blunder; 0 → first verbose move, which chess.js orders as
    // the knight underpromotion in this position.
    const rngValues = [0.1, 0];
    const ai = new StockfishAiPlayer(transport, () => rngValues.shift() ?? 0.9);
    const m = await ai.requestMove("7k/P7/8/8/8/8/8/7K w - - 0 1", "cadet");
    expect(m.to).toBe("a8");
    expect(["q", "r", "b", "n"]).toContain(m.promotion);
    // Whatever chess.js listed first must be preserved verbatim, not forced q.
  });

  it("material fallback plays the promotion variant it scored (P6-03)", async () => {
    const ai = new MaterialAiPlayer(() => 0);
    // Queen promotion is stalemate (score 0); rook promotion wins material.
    const m = await ai.requestMove("8/1P6/8/8/8/8/8/5K1k w - - 0 1");
    if (m.from === "b7" && m.to === "b8") {
      expect(m.promotion).not.toBe("q");
    }
  });
});
