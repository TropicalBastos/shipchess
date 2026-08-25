# ⚓ ShipChess

Chess on the open sea. Two fleets face off across a living ocean — every
piece is a warship riding real waves, every capture a broadside and a
sinking. Play a friend on one screen, or face the Admiral: a real Stockfish
engine with four ranks from blundering Cadet to full-strength Fleet Admiral.

## Play

- **Select a ship** by clicking it — its legal squares glow on the water.
- **Move** by clicking a highlighted square. Illegal squares flash red.
- **Drag** to orbit the camera, **scroll** to zoom.
- **Menu button** (top right) pauses: change the time of day, or quit.
- **The knight is a submarine** — it dives under the fleet, which is why it
  can jump. The flagship's masthead light flashes red when in check.
- Promotions offer all four ships, underpromotions included.

## The fleet

| Chess piece | Ship |
| --- | --- |
| Pawn | Patrol boat |
| Knight | Submarine |
| Bishop | Frigate |
| Rook | Battleship |
| Queen | Aircraft carrier |
| King | Flagship |

## Develop

```bash
npm install
npm run dev       # local dev server
npm test          # 111-test suite (rules, waves, animation, AI protocol)
npm run build     # production build to dist/
npm run preview   # serve the production build
```

Notable engineering: the Gerstner wave field is one function evaluated
identically in GLSL (vertex displacement) and TypeScript (ship placement),
with ships anchored in parameter space so they ride exactly the rendered
surface; chess rules come entirely from chess.js; the AI speaks UCI to a
vendored single-threaded Stockfish worker (no special headers needed); all
audio is synthesized with Web Audio at runtime.

## Licenses

ShipChess application code is MIT (see LICENSE). The bundled Stockfish
engine is GPL-3.0 — see THIRD-PARTY.md for full notices.
