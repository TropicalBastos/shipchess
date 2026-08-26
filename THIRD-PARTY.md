# Third-party software

NavalChess ships with, or builds on, the following third-party software:

## Stockfish (chess engine) — GPL-3.0
- Files served: `public/engine/stockfish-18-lite-single.js` and
  `public/engine/stockfish-18-lite-single.wasm` (unmodified, from the
  Stockfish.js 18 release).
- Copyright © 2026 Chess.com, LLC; based on Stockfish © T. Romstad,
  M. Costalba, J. Kiiski, G. Linscott and other contributors.
- License: GNU General Public License v3.0 — https://www.gnu.org/licenses/gpl-3.0.html
- Exact provenance: npm package `stockfish@18.0.8`, files
  `bin/stockfish-18-lite-single.js` (sha256 5243fd9b276cab7dfe3ad1d43ab9ead73568fac76468c614242977a210c4a391)
  and `bin/stockfish-18-lite-single.wasm` (sha256 a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1).
- Corresponding source for this exact build: the Stockfish.js 18 release of
  https://github.com/nmrugg/stockfish.js (also packaged inside
  `stockfish@18.0.8` on npm, which includes the source and build scripts).
- The complete GPL-3.0 text is distributed with this application at
  `licenses/gpl-3.0.txt`.
- The engine runs as a separate Web Worker and communicates with NavalChess
  exclusively over UCI text messages. It is distributed here as an
  unmodified aggregate alongside the (MIT-licensed) application code.

## three.js — MIT
- https://github.com/mrdoob/three.js — © 2010–2026 three.js authors.

## chess.js — BSD-2-Clause
- https://github.com/jhlywa/chess.js — © Jeff Hlywa.

## Fonts — SIL Open Font License 1.1 (served via Google Fonts)
- Saira, Saira Stencil One.

All sound effects and 3D models in NavalChess are procedurally generated at
runtime and carry no third-party assets.

---

## Full license texts

### three.js (MIT)

```
The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### chess.js (BSD-2-Clause)

```
Copyright (c) 2025, Jeff Hlywa (jhlywa@gmail.com)
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```
