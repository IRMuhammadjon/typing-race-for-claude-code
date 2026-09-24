// Umumiy qobiq: Claude holati, til, o'yinlarni almashtirish, pauza/overlay va klaviatura.
// Har bir o'yin App.register({...}) orqali qo'shiladi (media/games/*.js).
(function () {
  const vscode = acquireVsCodeApi();
  const LANGS = Object.keys(window.I18N);
  const $ = (id) => document.getElementById(id);

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const App = {
    lang: 'en',
    T: null,
    games: {},
    order: [],
    active: null,
    // o'yin id -> ready | playing | paused | over
    state: {},
    best: {},
    escapeHtml,
    post: (m) => vscode.postMessage(m),
  };
  window.App = App;

  const ui = {
    stage: $('stage'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayText: $('overlay-text'),
    tabs: $('tabs'),
    hints: $('hints'),
    claude: $('claude-status'),
    claudeTitle: $('claude-title'),
    claudeSub: $('claude-sub'),
    sessions: $('sessions'),
    toast: $('toast'),
  };

  // data-ref="nom" elementlarini obyektga yig'adi
  App.refs = (root) => {
    const refs = {};
    for (const el of root.querySelectorAll('[data-ref]')) refs[el.dataset.ref] = el;
    return refs;
  };

  const current = () => App.games[App.active];

  App.register = (game) => {
    const section = document.createElement('section');
    section.className = `game game-${game.id}`;
    section.hidden = true;
    ui.stage.insertBefore(section, ui.overlay);
    game.section = section;
    App.games[game.id] = game;
    App.order.push(game.id);
    App.state[game.id] = 'ready';
    game.mount(section);
  };

  App.saveBest = (id, value) => {
    if (value <= (App.best[id] || 0)) return false;
    App.best[id] = value;
    App.post({ type: 'best', game: id, value });
    return true;
  };

  // ---------- Overlay va o'yin holati ----------

  // Overlay matni funksiya sifatida saqlanadi: til almashganda qayta chiziladi
  let overlayFn = null;
  const overText = {};
  const pauseText = () => [App.T.pause, App.T.pauseSub];

  function showOverlay(fn) {
    overlayFn = fn;
    const [title, text] = fn();
    ui.overlayTitle.textContent = title;
    ui.overlayText.textContent = text;
    ui.stage.classList.add('blurred');
  }

  function hideOverlay() {
    overlayFn = null;
    ui.stage.classList.remove('blurred');
  }

  function overlayFor(id) {
    const st = App.state[id];
    if (st === 'ready') return App.games[id].startText;
    if (st === 'over') return overText[id];
    return pauseText;
  }

  App.start = () => {
    const g = current();
    App.state[g.id] = 'playing';
    hideOverlay();
    if (g.start) g.start();
    acknowledgeNotice();
  };

  App.pause = (fn) => {
    const g = current();
    const st = App.state[g.id];
    if (st === 'ready' || st === 'over') return;
    if (st === 'playing') {
      App.state[g.id] = 'paused';
      if (g.pause) g.pause();
    }
    showOverlay(fn);
  };

  App.end = (fn) => {
    const g = current();
    App.state[g.id] = 'over';
    overText[g.id] = fn;
    if (g.pause) g.pause();
    showOverlay(fn);
  };

  App.restart = () => {
    current().reset();
    App.start();
  };

  App.isPlaying = (id) => App.active === id && App.state[id] === 'playing';

  function switchGame(id, remember) {
    if (!App.games[id] || id === App.active) return;
    const prev = current();
    if (prev) {
      if (App.state[prev.id] === 'playing') {
        App.state[prev.id] = 'paused';
        if (prev.pause) prev.pause();
      }
      prev.section.hidden = true;
    }
    App.active = id;
    const g = current();
    g.section.hidden = false;
    document.body.dataset.game = id;
    if (g.show) g.show();
    showOverlay(overlayFor(id));
    renderTabs();
    renderHints();
    if (remember) App.post({ type: 'game', value: id });
  }

  function renderTabs() {
    ui.tabs.innerHTML = App.order
      .map((id) => {
        const g = App.games[id];
        return `<button class="tab${id === App.active ? ' selected' : ''}" data-game-tab="${id}"><span class="tab-icon">${g.icon}</span>${escapeHtml(App.T.games[g.labelKey])}</button>`;
      })
      .join('');
  }

  function renderHints() {
    const g = current();
    ui.hints.innerHTML = g
      .hints()
      .map(([key, label]) => `<span><kbd>${escapeHtml(key)}</kbd> ${escapeHtml(label)}</span>`)
      .join('');
  }

  let toastTimer;
  App.toast = (text) => {
    ui.toast.textContent = text;
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 1800);
  };

  // ---------- Klaviatura va sichqoncha ----------

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.altKey) return;
    const g = current();
    const st = App.state[g.id];

    if (e.key === 'Tab') {
      e.preventDefault();
      App.restart();
      return;
    }
    if (e.ctrlKey && e.key !== 'Backspace') return;

    if (st === 'paused') {
      if (e.key === 'Enter') {
        e.preventDefault();
        App.start();
      }
      return;
    }
    if (st === 'over') {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        App.restart();
      }
      return;
    }
    if (st === 'ready') {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        App.start();
        return;
      }
      // Masalan, typing'da birinchi harf o'yinni boshlaydi va o'zi ham yoziladi
      if (!(g.startsOn && g.startsOn(e))) return;
      App.start();
    }

    if (e.key === 'Escape') {
      App.pause(pauseText);
      return;
    }
    if (g.keydown(e)) e.preventDefault();
  });

  document.addEventListener('keyup', (e) => {
    const g = current();
    if (g && g.keyup) g.keyup(e);
  });

  // Real vaqtli o'yinlar (bug smash) oyna fokusni yo'qotganda to'xtaydi
  window.addEventListener('blur', () => {
    const g = current();
    if (g && g.pauseOnBlur && App.isPlaying(g.id)) App.pause(pauseText);
  });

  window.addEventListener('resize', () => {
    const g = current();
    if (g && g.resize) g.resize();
  });

  ui.overlay.addEventListener('click', () => {
    if (App.state[App.active] === 'over') App.restart();
    else App.start();
  });

  ui.tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-game-tab]');
    if (!btn) return;
    btn.blur();
    switchGame(btn.dataset.gameTab, true);
  });

  $('author').addEventListener('click', (e) => {
    e.currentTarget.blur();
    App.post({ type: 'openAuthor' });
  });

  // ---------- Til ----------

  function applyStaticTexts() {
    document.documentElement.lang = App.lang;
    for (const el of document.querySelectorAll('[data-i18n]')) {
      el.textContent = el.dataset.i18n.split('.').reduce((o, k) => o[k], App.T);
    }
    $('author').title = App.T.authorTitle;
    for (const btn of document.querySelectorAll('[data-lang-option]')) {
      btn.classList.toggle('selected', btn.dataset.langOption === App.lang);
    }
  }

  function setLang(next) {
    if (!LANGS.includes(next)) return;
    App.lang = next;
    App.T = window.I18N[next];
    applyStaticTexts();
    for (const id of App.order) if (App.games[id].relabel) App.games[id].relabel();
    renderTabs();
    renderHints();
    renderClaude();
    if (ui.stage.classList.contains('blurred') && overlayFn) showOverlay(overlayFn);
  }

  $('langs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-lang-option]');
    if (!btn) return;
    btn.blur();
    setLang(btn.dataset.langOption);
    App.post({ type: 'lang', value: App.lang });
  });

  // ---------- Claude holati ----------

  let claudeWasActive = false;
  let claudeView = '';
  let claude = { status: 'idle', tool: '', sessions: [] };
  // Tugagan, lekin foydalanuvchi hali ko'rmagan sessiya (Enter bosilguncha ko'rsatiladi)
  let finishedNotice = null;

  const quote = (s) => `«${s.title}»`;

  // Fon rangi va katta panel orqali holatni bildiradi: o'ynayotgan odam burchakka qaramaydi
  function showClaude(view, title, sub) {
    ui.claudeTitle.textContent = title;
    ui.claudeSub.textContent = sub;
    if (view === claudeView) return;
    claudeView = view;
    document.body.dataset.claude = view;
    ui.claude.classList.remove('bump');
    void ui.claude.offsetWidth;
    ui.claude.classList.add('bump');
  }

  function renderSessions() {
    const list = claude.sessions;
    // Bitta sessiya bo'lsa, ro'yxat kerak emas: katta panelning o'zi yetarli
    if (list.length < 2) {
      ui.sessions.innerHTML = '';
      return;
    }
    const label = App.T.state;
    ui.sessions.innerHTML = list
      .map(
        (s) => `<div class="session ${s.status}">
          <span class="dot"></span>
          <span class="name">${escapeHtml(s.title)}</span>
          ${s.project ? `<span class="project">${escapeHtml(s.project)}</span>` : ''}
          <span class="state">${label[s.status]}${s.status === 'busy' && s.tool ? ' · ' + escapeHtml(s.tool) : ''}</span>
        </div>`
      )
      .join('');
  }

  function renderClaude() {
    const T = App.T;
    renderSessions();
    const busy = claude.sessions.filter((s) => s.status === 'busy');
    const waiting = claude.sessions.find((s) => s.status === 'waiting');
    const multi = claude.sessions.length > 1;
    const busyNote = busy.length ? T.othersBusy(busy.length) : T.noOthersBusy;

    if (waiting) {
      showClaude('waiting', T.waiting(multi ? quote(waiting) : T.claude), T.waitingSub);
    } else if (finishedNotice) {
      showClaude('done', T.finished(quote(finishedNotice)), T.finishedSub(busyNote));
    } else if (busy.length) {
      claudeWasActive = true;
      const title = busy.length > 1 ? T.busyMulti(busy.length) : T.busy(busy[0].tool);
      const sub = busy.length > 1 ? T.busyMultiSub : T.busySub(quote(busy[0]));
      showClaude('busy', title, sub);
    } else if (claudeWasActive) {
      showClaude('done', T.allDone, T.allDoneSub);
    } else {
      showClaude('idle', T.idle, T.idleSub);
    }
  }

  function onFinished(session) {
    claudeWasActive = true;
    finishedNotice = session;
    renderClaude();
    App.pause(() => [App.T.finished(quote(session)), App.T.finishedOverlaySub]);
  }

  function onWaiting(session) {
    renderClaude();
    App.pause(() => [App.T.waiting(quote(session)), App.T.waitingOverlaySub]);
  }

  // O'yin davom etganda "tugatdi" xabari ko'rilgan hisoblanadi
  function acknowledgeNotice() {
    if (!finishedNotice) return;
    finishedNotice = null;
    renderClaude();
  }

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type === 'init') {
      App.best = m.best || {};
      for (const id of App.order) if (App.games[id].refresh) App.games[id].refresh();
      if (m.game) switchGame(m.game, false);
    } else if (m.type === 'claude') {
      claude = m;
      renderClaude();
    } else if (m.type === 'finished') {
      onFinished(m);
    } else if (m.type === 'waiting') {
      onWaiting(m);
    }
  });

  // Barcha o'yinlar ro'yxatdan o'tgach chaqiriladi (media/boot.js)
  App.boot = () => {
    App.lang = LANGS.includes(document.body.dataset.lang) ? document.body.dataset.lang : 'en';
    App.T = window.I18N[App.lang];
    applyStaticTexts();
    for (const id of App.order) if (App.games[id].relabel) App.games[id].relabel();
    renderClaude();
    switchGame(App.order[0], false);
    App.post({ type: 'ready' });
  };
})();
