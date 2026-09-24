// 2048 (terminal): strelkalar yoki WASD bilan. Ranglar VS Code versiyasidagi bilan bir xil.
const ID = 'g2048';
const SIZE = 4;
// Birlashgan kataklar shuncha vaqt yorqinroq ko'rinadi
const FLASH_MS = 180;

const DIRS = {
  left: 'left', right: 'right', up: 'up', down: 'down',
  a: 'left', d: 'right', w: 'up', s: 'down',
  A: 'left', D: 'right', W: 'up', S: 'down',
};
const VECTORS = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] };

// [fon, matn] — kichik qiymatlar kulrang, kattalashgan sari sariq va to'q sariqqa o'tadi
const TILE = {
  2: ['#3e4044', '#d1d0c5'],
  4: ['#4a4c50', '#d1d0c5'],
  8: ['#6e5d2a', '#d1d0c5'],
  16: ['#8a7120', '#f2efe4'],
  32: ['#a8871a', '#f2efe4'],
  64: ['#c49e16', '#2c2e31'],
  128: ['#e2b714', '#2c2e31'],
  256: ['#e09a45', '#2c2e31'],
  512: ['#e07a52', '#ffffff'],
  1024: ['#ca4754', '#ffffff'],
  2048: ['#8fbf7f', '#2c2e31'],
};
const SUPER = ['#a58fbf', '#ffffff'];
const EMPTY = '#38393c';

const dirOf = (k) => (k.name === 'char' ? DIRS[k.ch] : DIRS[k.name]);

module.exports = function create2048(app) {
  let grid;
  let score = 0;
  let won = false;
  let flash = new Map(); // "r,c" -> vaqt

  function empty() {
    const cells = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!grid[r][c]) cells.push([r, c]);
    return cells;
  }

  function spawn() {
    const cells = empty();
    if (!cells.length) return;
    const [r, c] = cells[Math.floor(Math.random() * cells.length)];
    grid[r][c] = Math.random() < 0.9 ? 2 : 4;
  }

  function canMove() {
    if (empty().length) return true;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = grid[r][c];
        if ((c + 1 < SIZE && grid[r][c + 1] === v) || (r + 1 < SIZE && grid[r + 1][c] === v)) return true;
      }
    }
    return false;
  }

  function move(dir) {
    const [dr, dc] = VECTORS[dir];
    const order = [...Array(SIZE).keys()];
    const rows = dr > 0 ? [...order].reverse() : order;
    const cols = dc > 0 ? [...order].reverse() : order;
    const merged = new Set();
    let moved = false;
    flash = new Map();

    for (const r of rows) {
      for (const c of cols) {
        const v = grid[r][c];
        if (!v) continue;
        let [nr, nc] = [r, c];
        while (true) {
          const [tr, tc] = [nr + dr, nc + dc];
          if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE) break;
          if (!grid[tr][tc]) {
            [nr, nc] = [tr, tc];
            continue;
          }
          // Bir yurishda har bir katak faqat bir marta birlashadi
          if (grid[tr][tc] === v && !merged.has(`${tr},${tc}`)) {
            grid[r][c] = 0;
            grid[tr][tc] = v * 2;
            score += v * 2;
            merged.add(`${tr},${tc}`);
            flash.set(`${tr},${tc}`, Date.now());
            moved = true;
            nr = null;
          }
          break;
        }
        if (nr !== null && (nr !== r || nc !== c)) {
          grid[r][c] = 0;
          grid[nr][nc] = v;
          moved = true;
        }
      }
    }
    if (!moved) return;

    spawn();
    app.saveBest(ID, score);
    if (!won && grid.some((row) => row.some((v) => v >= 2048))) {
      won = true;
      app.toast(app.T.g2048Win);
    }
    if (!canMove()) app.end(() => [app.T.g2048Over(score), app.T.playAgain]);
  }

  return {
    id: ID,
    labelKey: 'g2048',
    aliases: ['2048'],

    reset() {
      grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
      score = 0;
      won = false;
      flash = new Map();
      spawn();
      spawn();
    },

    startsOn: (k) => Boolean(dirOf(k)),

    key(k) {
      const dir = dirOf(k);
      if (!dir) return false;
      move(dir);
      return true;
    },

    draw(s, box, C) {
      const T = app.T;
      // Joy yetsa katta kataklar (3 qator), bo'lmasa ixcham (1 qator)
      const tall = box.h >= 18;
      const cw = 8;
      const ch = tall ? 3 : 1;
      const vgap = tall && box.h >= 20 ? 1 : 0;
      const bw = SIZE * cw + (SIZE + 1) * 2;
      const bh = SIZE * ch + (SIZE + 1) * vgap + (vgap ? 0 : 2);
      const bx = box.x + Math.floor((box.w - bw) / 2);
      const by = box.y + Math.max(2, Math.floor((box.h - bh - 2) / 2) + 2);

      // Ochko
      const hud = `${T.stats.score} ${score}    ${T.stats.best} ${app.best[ID] || 0}`;
      let x = box.x + Math.floor((box.w - hud.length) / 2);
      x += s.text(x, by - 2, `${T.stats.score} `, { fg: C.sub });
      x += s.text(x, by - 2, String(score), { fg: C.main, bold: true });
      x += s.text(x, by - 2, `    ${T.stats.best} `, { fg: C.sub });
      s.text(x, by - 2, String(app.best[ID] || 0), { fg: C.main, bold: true });

      s.fill(bx, by, bw, bh, C.alt);
      const now = Date.now();
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const v = grid[r][c];
          const cx = bx + 2 + c * (cw + 2);
          const cy = by + (vgap ? vgap + r * (ch + vgap) : 1 + r * ch);
          const [bg, fg] = v ? TILE[v] || SUPER : [EMPTY, C.sub];
          s.fill(cx, cy, cw, ch, bg);
          if (!v) continue;
          const label = String(v);
          const bright = now - (flash.get(`${r},${c}`) || 0) < FLASH_MS;
          s.text(cx + Math.floor((cw - label.length) / 2), cy + Math.floor(ch / 2), label, {
            fg: bright ? '#ffffff' : fg,
            bg,
            bold: true,
          });
        }
      }
    },

    startText: () => [app.T.g2048Start, app.T.g2048StartSubKeys],
    hints: (T) => [
      ['← ↑ → ↓', T.keys.move],
      ['tab', T.keys.restart],
      ['esc', T.keys.pause],
    ],
  };
};
