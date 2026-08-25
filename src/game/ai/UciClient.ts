/**
 * UCI protocol client over an abstract transport (the browser passes the
 * vendored Stockfish worker; tests pass a fake). Lifecycle per the plan:
 * init = uci→uciok, setoptions, isready→readyok with a timeout; ucinewgame
 * per game; every search carries a requestId — stale bestmoves are dropped
 * by the CALLER comparing ids; stop() interrupts; onerror surfaces.
 */

export interface EngineTransport {
  postMessage(line: string): void;
  onMessage(handler: (line: string) => void): void;
  onError(handler: (err: unknown) => void): void;
  terminate(): void;
}

export interface SearchPreset {
  /** UCI Skill Level 0–20 (20 = handicap off, full strength). */
  skill: number;
  /** Either a fixed depth or a movetime in ms. */
  go: { depth: number } | { movetime: number };
}

export const PRESETS: Record<string, SearchPreset> = {
  cadet: { skill: 0, go: { depth: 1 } },
  captain: { skill: 6, go: { movetime: 300 } },
  admiral: { skill: 13, go: { movetime: 1000 } },
  fleet: { skill: 20, go: { movetime: 2000 } },
};

export interface EngineMove {
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
}

const HANDSHAKE_TIMEOUT_MS = 10_000;

export class UciClient {
  private readonly transport: EngineTransport;
  private lineHandlers: Array<(line: string) => boolean> = [];
  private failed: unknown = null;

  constructor(transport: EngineTransport) {
    this.transport = transport;
    transport.onMessage((line) => {
      this.lineHandlers = this.lineHandlers.filter((h) => !h(line));
    });
    transport.onError((err) => {
      this.failed = err;
      // Fail every waiter immediately.
      const handlers = this.lineHandlers;
      this.lineHandlers = [];
      for (const h of handlers) h("__engine_error__");
    });
  }

  private waitFor(
    predicate: (line: string) => boolean,
    timeoutMs: number,
    what: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.failed) {
        reject(new Error(`engine failed before ${what}`));
        return;
      }
      const timer = setTimeout(() => {
        this.lineHandlers = this.lineHandlers.filter((h) => h !== handler);
        reject(new Error(`engine timeout waiting for ${what}`));
      }, timeoutMs);
      const handler = (line: string): boolean => {
        if (line === "__engine_error__") {
          clearTimeout(timer);
          reject(new Error(`engine error while waiting for ${what}`));
          return true;
        }
        if (!predicate(line)) return false;
        clearTimeout(timer);
        resolve(line);
        return true;
      };
      this.lineHandlers.push(handler);
    });
  }

  /** uci → uciok, then isready → readyok. */
  async init(): Promise<void> {
    const uciok = this.waitFor((l) => l === "uciok", HANDSHAKE_TIMEOUT_MS, "uciok");
    this.transport.postMessage("uci");
    await uciok;
    await this.ready();
  }

  private async ready(): Promise<void> {
    const ok = this.waitFor((l) => l === "readyok", HANDSHAKE_TIMEOUT_MS, "readyok");
    this.transport.postMessage("isready");
    await ok;
  }

  /** Reset engine state between games (keeps the worker warm). */
  async newGame(): Promise<void> {
    this.transport.postMessage("ucinewgame");
    await this.ready();
  }

  /** Run one search. The caller owns staleness (compare its own requestId). */
  async search(fen: string, preset: SearchPreset): Promise<EngineMove> {
    this.transport.postMessage(`setoption name Skill Level value ${preset.skill}`);
    this.transport.postMessage(`position fen ${fen}`);
    const done = this.waitFor(
      (l) => l.startsWith("bestmove"),
      HANDSHAKE_TIMEOUT_MS + ("movetime" in preset.go ? preset.go.movetime : 0),
      "bestmove",
    );
    this.transport.postMessage(
      "depth" in preset.go
        ? `go depth ${preset.go.depth}`
        : `go movetime ${preset.go.movetime}`,
    );
    const line = await done;
    const uci = line.split(/\s+/)[1];
    if (!uci || uci === "(none)") throw new Error(`engine returned no move: ${line}`);
    return {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: (uci[4] as EngineMove["promotion"]) || undefined,
    };
  }

  /** Interrupt an in-flight search; the pending bestmove resolves/drains. */
  stop(): void {
    this.transport.postMessage("stop");
  }

  dispose(): void {
    this.transport.terminate();
  }
}
