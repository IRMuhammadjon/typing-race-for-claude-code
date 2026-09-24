// 2048: klassik o'yin, yumshoq serika ranglarida; strelkalar, WASD yoki sichqoncha bilan surish
(function () {
  const App = window.App;
  const ID = 'g2048';
  const SIZE = 4;
  const SLIDE_MS = 110;
  // Sichqoncha bilan surishda shuncha pikseldan kam harakat hisobga olinmaydi
  const SWIPE_MIN = 30;

  const KEY_DIRS = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    a: 'left', d: 'right', w: 'up', s: 'down',
    A: 'left', D: 'right', W: 'up', S: 'down',
  };
  const VECTORS = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] };

  let ui;
  let tiles = []; // { id, value, r, c, el }
  let nextId = 1;
  let score = 0;
  let won = false;
  let busy = false; // animatsiya paytida yangi yurish qabul qilinmaydi

  function emptyCells() {
    const taken = new Set(tiles.map((t) => t.r * SIZE + t.c));
    const cells = [];
    for (let i = 0; i < SIZE * SIZE; i++) if (!taken.has(i)) cells.push(i);
    return cells;
  }

  function spawn() {
    const cells = emptyCells();
    if (!cells.length) return;
    const cell = cells[Math.floor(Math.random() * cells.length)];
    const tile = { id: nextId++, value: Math.random() < 0.9 ? 2 : 4, r: Math.floor(cell / SIZE), c: cell % SIZE };
    tiles.push(tile);
    draw(tile, 'new');
  }

  function draw(tile, anim) {
    if (!tile.el) {
      tile.el = document.createElement('div');
      ui.tiles.appendChild(tile.el);
    }
    const v = tile.value;
    tile.el.className = `tile v${v > 2048 ? 'super' : v}${v >= 1024 ? ' small' : ''}${anim ? ' ' + anim : ''}`;
    tile.el.textContent = v;
    tile.el.style.setProperty('--r', tile.r);
    tile.el.style.setProperty('--c', tile.c);
  }

  function renderScore() {
    ui.score.textContent = score;
    ui.best.textContent = App.best[ID] || 0;
  }

  function grid() {
    const g = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    for (const t of tiles) g[t.r][t.c] = t;
    return g;
  }

  function canMove() {
    if (tiles.length < SIZE * SIZE) return true;
    const g = grid();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = g[r][c].value;
        if ((c + 1 < SIZE && g[r][c + 1].value === v) || (r + 1 < SIZE && g[r + 1][c].value === v)) return true;
      }
    }
    return false;
  }

  function move(dir) {
    if (busy) return;
    const [dr, dc] = VECTORS[dir];
    const g = grid();
    const order = [...Array(SIZE).keys()];
    const rows = dr > 0 ? [...order].reverse() : order;
    const cols = dc > 0 ? [...order].reverse() : order;
    const merged = new Set();
    const removed = [];
    let moved = false;
    let gained = 0;

    for (const r of rows) {
      for (const c of cols) {
        const tile = g[r][c];
        if (!tile) continue;
        let [nr, nc] = [r, c];
        while (true) {
          const [tr, tc] = [nr + dr, nc + dc];
          if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE) break;
          const other = g[tr][tc];
          if (!other) {
            [nr, nc] = [tr, tc];
            continue;
          }
          // Bir yurishda har bir katak faqat bir marta birlashadi
          if (other.value === tile.value && !merged.has(other.id)) {
            g[r][c] = null;
            tile.r = tr;
            tile.c = tc;
            other.value *= 2;
            gained += other.value;
            merged.add(other.id);
            removed.push(tile);
            moved = true;
            draw(tile);
            nr = null;
          }
          break;
        }
        if (nr !== null && (nr !== r || nc !== c)) {
          g[r][c] = null;
          g[nr][nc] = tile;
          tile.r = nr;
          tile.c = nc;
          moved = true;
          draw(tile);
        }
      }
    }
    if (!moved) return;

    score += gained;
    tiles = tiles.filter((t) => !removed.includes(t));
    busy = true;
    setTimeout(() => {
      for (const t of removed) t.el.remove();
      for (const t of tiles) if (merged.has(t.id)) draw(t, 'merged');
      spawn();
      busy = false;
      App.saveBest(ID, score);
      renderScore();
      if (!won && tiles.some((t) => t.value >= 2048)) {
        won = true;
        App.toast(App.T.g2048Win);
      }
      if (!canMove()) App.end(() => [App.T.g2048Over(score), App.T.playAgain]);
    }, SLIDE_MS);
  }

  function reset() {
    ui.tiles.innerHTML = '';
    tiles = [];
    score = 0;
    won = false;
    busy = false;
    spawn();
    spawn();
    renderScore();
  }

  function mount(root) {
    root.innerHTML = `
      <div class="g-hud">
        <div class="stat"><span class="label" data-i18n="stats.score"></span><span class="value" data-ref="score">0</span></div>
        <div class="stat"><span class="label" data-i18n="stats.best"></span><span class="value" data-ref="best">0</span></div>
      </div>
      <div class="board" data-ref="board">
        <div class="cells">${'<div class="cell"></div>'.repeat(SIZE * SIZE)}</div>
        <div class="tiles" data-ref="tiles"></div>
      </div>`;
    ui = App.refs(root);

    // Sichqoncha yoki sensor bilan surish
    let from = null;
    ui.board.addEventListener('pointerdown', (e) => {
      from = { x: e.clientX, y: e.clientY };
      ui.board.setPointerCapture(e.pointerId);
    });
    ui.board.addEventListener('pointerup', (e) => {
      if (!from) return;
      const dx = e.clientX - from.x;
      const dy = e.clientY - from.y;
      from = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
      if (!App.isPlaying(ID)) App.start();
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    });

    reset();
  }

  App.register({
    id: ID,
    labelKey: 'g2048',
    icon: '▦',
    mount,
    reset,
    keydown(e) {
      const dir = KEY_DIRS[e.key];
      if (!dir) return false;
      move(dir);
      return true;
    },
    startsOn: (e) => Boolean(KEY_DIRS[e.key]),
    startText: () => [App.T.g2048Start, App.T.g2048StartSub],
    hints: () => [
      ['← ↑ → ↓', App.T.keys.move],
      ['tab', App.T.keys.restart],
      ['esc', App.T.keys.pause],
      ['🖱', App.T.keys.mouse],
    ],
    refresh() {
      if (ui) renderScore();
    },
  });
})();
