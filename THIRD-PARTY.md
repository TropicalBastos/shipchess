# Third-party software

ShipChess ships with, or builds on, the following third-party software:

## Stockfish (chess engine) — GPL-3.0
- Files served: `public/engine/stockfish-18-lite-single.js` and
  `public/engine/stockfish-18-lite-single.wasm` (unmodified, from the
  Stockfish.js 18 release).
- Copyright © 2026 Chess.com, LLC; based on Stockfish © T. Romstad,
  M. Costalba, J. Kiiski, G. Linscott and other contributors.
- License: GNU General Public License v3.0 — https://www.gnu.org/licenses/gpl-3.0.html
- Corresponding source: https://github.com/nmrugg/stockfish.js
- The engine runs as a separate Web Worker and communicates with ShipChess
  exclusively over UCI text messages. It is distributed here as an
  unmodified aggregate alongside the (MIT-licensed) application code.

## three.js — MIT
- https://github.com/mrdoob/three.js — © 2010–2026 three.js authors.

## chess.js — BSD-2-Clause
- https://github.com/jhlywa/chess.js — © Jeff Hlywa.

## Fonts — SIL Open Font License 1.1 (served via Google Fonts)
- Saira, Saira Stencil One.

All sound effects and 3D models in ShipChess are procedurally generated at
runtime and carry no third-party assets.
