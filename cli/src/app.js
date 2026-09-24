// Terminal qobig'i: Claude holati paneli, o'yin tablari, pauza/overlay, klaviatura, kadr sikli.
// VS Code'dagi media/shell.js ning terminal muqobili.
const fs = require('fs');
const path = require('path');
const shared = require('./shared');
const { Screen } = require('./term');

const I18N = shared('i18n');
const { claudeBanner, quote } = shared('banner');
const { CLAUDE_DIR } = shared('claude-watch');

const LANGS = Object.keys(I18N);
const STORE_FILE = path.join(CLAUDE_DIR, 'typing-race', 'cli.json');
const MAX_WIDTH = 90;
const FPS = 30;

// Serika dark palitrasi (VS Code versiyasi bilan bir xil)
const COLORS = {
  bg: '#323437',
  alt: '#2c2e31',
  sub: '#646669',
  text: '#d1d0c5',
  main: '#e2b714',
  error: '#ca4754',
  errorExtra: '#7e2a33',
  done: '#8fbf7f',
  warn: '#e0a35e',
  spark: '#e07a52',
};
// Claude tugatganda yoki ruxsat so'raganda butun fon rangi yumshoq o'zgaradi
const VIEW_BG = {
  idle: [COLORS.bg, COLORS.alt],
  busy: [COLORS.bg, COLORS.alt],
  done: ['#2e3832', '#28312b'],
  waiting: ['#3a3430', '#332d29'],
};
const VIEW_ACCENT = { idle: COLORS.sub, busy: COLORS.main, done: COLORS.done, waiting: COLORS.warn };

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveStore(store) {
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
  } catch {
    // Saqlab bo'lmasa ham o'yin ishlayveradi
  }
}

function detectLang() {
  const env = `${process.env.LC_ALL || ''} ${process.env.LANG || ''}`.toLowerCase();
  if (/\bru/.test(env)) return 'ru';
  if (/\buz/.test(env)) return 'uz';
  return 'en';
}

function createApp({ term, gameFactories, lang, game }) {
  const store = loadStore();
  const app = {
    colors: { ...COLORS },
    lang: LANGS.includes(lang) ? lang : LANGS.includes(store.lang) ? store.lang : detectLang(),
    T: null,
    games: [],
    active: 0,
    state: {}, // o'yin id -> ready | playing | paused | over
    best: store.best || {},
    now: () => Date.now(),
  };
  app.T = I18N[app.lang];

  let overlayFn = null;
  const overText = {};
  let toast = null;
  let claude = { status: 'idle', tool: '', sessions: [] };
  let finishedNotice = null;
  let wasActive = false;
  let loop = null;
  let slowLoop = null;

  const current = () => app.games[app.active];
  const pauseText = () => [app.T.pause, app.T.pauseSub];

  app.isPlaying = (id) => current().id === id && app.state[id] === 'playing';

  app.saveBest = (id, value) => {
    if (value <= (app.best[id] || 0)) return false;
    app.best[id] = value;
    store.best = app.best;
    saveStore(store);
    return true;
  };

  app.toast = (text) => {
    toast = { text, until: Date.now() + 1800 };
    render();
  };

  // ---------- O'yin holati ----------

  function syncLoop() {
    const g = current();
    const want = g.realtime && app.state[g.id] === 'playing';
    if (want && !loop) {
      let last = Date.now();
      loop = setInterval(() => {
        const now = Date.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (g.tick) g.tick(dt);
        render();
      }, 1000 / FPS);
    } else if (!want && loop) {
      clearInterval(loop);
      loop = null;
    }
    term.mouse(Boolean(g.mouse) && app.state[g.id] === 'playing');
  }

  app.start = () => {
    const g = current();
    app.state[g.id] = 'playing';
    overlayFn = null;
    if (finishedNotice) finishedNotice = null;
    if (g.start) g.start();
    syncLoop();
    render();
  };

  app.pause = (fn) => {
    const g = current();
    const st = app.state[g.id];
    if (st === 'ready' || st === 'over') return;
    if (st === 'playing') {
      app.state[g.id] = 'paused';
      if (g.pause) g.pause();
    }
    overlayFn = fn;
    syncLoop();
    render();
  };

  app.end = (fn) => {
    const g = current();
    app.state[g.id] = 'over';
    overText[g.id] = fn;
    overlayFn = fn;
    if (g.pause) g.pause();
    syncLoop();
    render();
  };

  app.restart = () => {
    current().reset();
    app.start();
  };

  function overlayFor(g) {
    const st = app.state[g.id];
    if (st === 'ready') return g.startText;
    if (st === 'over') return overText[g.id];
    return pauseText;
  }

  function switchGame(index) {
    const prev = current();
    if (app.state[prev.id] === 'playing') {
      app.state[prev.id] = 'paused';
      if (prev.pause) prev.pause();
    }
    app.active = (index + app.games.length) % app.games.length;
    overlayFn = overlayFor(current());
    store.game = current().id;
    saveStore(store);
    syncLoop();
    render();
  }

  function setLang(next) {
    app.lang = next;
    app.T = I18N[next];
    store.lang = next;
    saveStore(store);
    render();
  }

  // ---------- Claude holati ----------

  function terminalTitle() {
    const b = banner();
    term.title(`zerikma · ${b.title.replace(/^[^\p{L}«]+/u, '')}`);
  }

  function banner() {
    if (claude.sessions.some((s) => s.status === 'busy')) wasActive = true;
    return claudeBanner(app.T, claude.sessions, finishedNotice, wasActive);
  }

  app.onClaude = (state) => {
    claude = state;
    terminalTitle();
    render();
  };

  // Bitta sessiya tugadi: o'yin to'xtaydi, terminal "ding" qiladi va nomi bilan aytiladi
  app.onFinished = (session) => {
    wasActive = true;
    finishedNotice = session;
    term.bell();
    terminalTitle();
    app.pause(() => [app.T.finished(quote(session)), app.T.finishedOverlaySub]);
    render();
  };

  app.onWaiting = (session) => {
    term.bell();
    app.pause(() => [app.T.waiting(quote(session)), app.T.waitingOverlaySub]);
    render();
  };

  // ---------- Klaviatura ----------

  app.key = (k) => {
    const g = current();
    const st = app.state[g.id];

    if (k.name === 'ctrl' && k.ch === 'c') return app.quit();
    if (k.name === 'ctrl' && k.ch === 'n') return switchGame(app.active + 1);
    if (k.name === 'ctrl' && k.ch === 'l') return setLang(LANGS[(LANGS.indexOf(app.lang) + 1) % LANGS.length]);
    if (k.name === 'tab') return app.restart();

    if (k.name === 'mouse') {
      if (st === 'playing' && g.mouse) g.mouse(k, gameBox);
      else if (!k.release && k.button === 0 && st !== 'playing') {
        if (st === 'over') app.restart();
        else app.start();
      }
      return;
    }

    if (st === 'paused') {
      if (k.name === 'enter') app.start();
      return;
    }
    if (st === 'over') {
      if (k.name === 'enter' || k.name === 'space') app.restart();
      return;
    }
    if (st === 'ready') {
      if (k.name === 'enter' || k.name === 'space') return app.start();
      // Masalan, typing'da birinchi harf o'yinni boshlaydi va o'zi ham yoziladi
      if (!(g.startsOn && g.startsOn(k))) return;
      app.start();
    }
    if (k.name === 'escape') return app.pause(pauseText);
    if (g.key(k)) render();
  };

  // ---------- Chizish ----------

  let screen = null;
  let gameBox = { x: 0, y: 0, w: 0, h: 0 };

  function centerText(s, y, x0, w, str, style) {
    const len = [...str].length;
    s.text(x0 + Math.max(0, Math.floor((w - len) / 2)), y, str, style);
  }

  function render() {
    const cols = term.cols;
    const rows = term.rows;
    const C = app.colors;
    const b = banner();
    const [bg, alt] = VIEW_BG[b.view];
    C.bg = bg;
    C.alt = alt;
    if (!screen || screen.w !== cols || screen.h !== rows) screen = new Screen(cols, rows, bg);
    const s = screen;
    s.clear(bg);

    const W = Math.min(cols - 4, MAX_WIDTH);
    const x0 = Math.floor((cols - W) / 2);
    let y = 1;

    // Sarlavha: logo, o'yin tablari, tillar
    s.text(x0, y, '✱ ', { fg: C.main, bold: true });
    s.text(x0 + 2, y, 'zerik', { fg: C.text, bold: true });
    s.text(x0 + 7, y, 'ma', { fg: C.sub, bold: true });
    const tabs = app.games.map((g) => ` ${app.T.games[g.labelKey]} `);
    const tabsLen = tabs.reduce((n, t) => n + [...t].length, 0) + tabs.length - 1;
    let tx = x0 + Math.max(10, Math.floor((W - tabsLen) / 2));
    tabs.forEach((t, i) => {
      const on = i === app.active;
      tx += s.text(tx, y, t, { fg: on ? C.main : C.sub, bg: on ? alt : undefined, bold: on }) + 1;
    });
    let lx = x0 + W - LANGS.length * 3 + 1;
    for (const l of LANGS) lx += s.text(lx, y, l, { fg: l === app.lang ? C.main : C.sub }) + 1;
    y += 2;

    // Claude holati: katta panel, fon rangi bilan birga
    const accent = VIEW_ACCENT[b.view];
    s.fill(x0, y, W, 2, alt);
    s.text(x0, y, '▌', { fg: accent, bg: alt });
    s.text(x0, y + 1, '▌', { fg: accent, bg: alt });
    s.text(x0 + 2, y, '● ', { fg: accent, bg: alt });
    // Boshidagi emoji terminalda 2 katak egallab qatorni surib yuboradi; rangli nuqta o'rnini bosadi
    const title = b.title.replace(/^[^\p{L}\p{N}«]+/u, '');
    s.text(x0 + 4, y, clip(title, W - 6), { fg: accent, bg: alt, bold: true });
    s.text(x0 + 4, y + 1, clip(b.sub, W - 6), { fg: C.sub, bg: alt });
    y += 2;

    // Bir nechta sessiya bo'lsa, har biri nomi bilan
    if (claude.sessions.length > 1) {
      const colorOf = { busy: C.main, waiting: C.warn, idle: C.done };
      for (const sess of claude.sessions.slice(0, 4)) {
        const state = app.T.state[sess.status] + (sess.status === 'busy' && sess.tool ? ` · ${sess.tool}` : '');
        s.text(x0 + 2, y, '•', { fg: colorOf[sess.status] });
        s.text(x0 + 4, y, clip(sess.title, W - state.length - 18), { fg: sess.status === 'idle' ? C.sub : C.text });
        if (sess.project) s.text(x0 + W - state.length - 14, y, clip(sess.project, 12), { fg: C.sub });
        s.text(x0 + W - state.length, y, state, { fg: colorOf[sess.status] });
        y++;
      }
    }
    y++;

    // O'yin maydoni (pastda: toast, 2 qator tugmalar, muallif)
    const bottom = rows - 5;
    gameBox = { x: x0, y, w: W, h: Math.max(4, bottom - y) };
    const g = current();
    g.draw(s, gameBox, C);

    if (overlayFn) {
      s.dim(gameBox.x, gameBox.y, gameBox.w, gameBox.h, C.sub, bg);
      const [title, text] = overlayFn();
      const bw = Math.min(W, Math.max([...title].length, [...text].length) + 6);
      const bx = x0 + Math.floor((W - bw) / 2);
      const by = gameBox.y + Math.floor(gameBox.h / 2) - 2;
      s.fill(bx, by, bw, 4, alt);
      centerText(s, by + 1, bx, bw, clip(title, bw - 2), { fg: C.text, bg: alt, bold: true });
      centerText(s, by + 2, bx, bw, clip(text, bw - 2), { fg: C.sub, bg: alt });
    }

    if (toast && toast.until > Date.now()) {
      const t = ` ${toast.text} `;
      centerText(s, rows - 4, x0, W, clip(t, W), { fg: C.text, bg: alt });
    }

    // Tugmalar: 1-qator o'yinniki, 2-qator umumiy
    const hintLine = (hints) => {
      const full = hints.map(([k, l]) => `${k} ${l}`).join('  ·  ');
      return [...full].length <= W ? full : hints.map(([k]) => k).join(' · ');
    };
    const T = app.T;
    centerText(s, rows - 3, x0, W, clip(hintLine(g.hints(T)), W), { fg: C.sub });
    const global = [['ctrl+n', T.keys.next], ['ctrl+l', T.keys.lang], ['ctrl+c', T.keys.quit]];
    centerText(s, rows - 2, x0, W, clip(hintLine(global), W), { fg: C.sub });
    if (rows > 20) centerText(s, rows - 1, x0, W, 'by Muhammadjon Rahmatullayev', { fg: C.sub });

    term.write(s.toAnsi());
  }

  function clip(str, n) {
    const chars = [...String(str)];
    if (n <= 0) return '';
    return chars.length > n ? chars.slice(0, Math.max(0, n - 1)).join('') + '…' : chars.join('');
  }

  app.render = render;
  // Testlar uchun: oxirgi chizilgan kadr
  app.lastScreen = () => screen;
  app.quit = () => {
    clearInterval(loop);
    clearInterval(slowLoop);
    if (app.onQuit) app.onQuit();
  };

  // ---------- Ishga tushirish ----------

  app.games = gameFactories.map((f) => f(app));
  for (const g of app.games) {
    app.state[g.id] = 'ready';
    g.reset();
  }
  const wanted = game || store.game;
  const idx = app.games.findIndex((g) => g.id === wanted || g.aliases?.includes(wanted));
  app.active = idx >= 0 ? idx : 0;
  overlayFn = current().startText;

  // Typing statistikasi, kursor miltillashi va toast'lar uchun sekin yangilanish
  slowLoop = setInterval(() => {
    const g = current();
    if (g.idle) g.idle();
    if (!loop) render();
  }, 200);

  return app;
}

module.exports = { createApp, COLORS };
