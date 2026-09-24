(function () {
  const vscode = acquireVsCodeApi();
  const LEVELS = window.WORD_LEVELS;
  const WORDS_PER_LEVEL = 15;
  // Joriy so'zdan keyin doim shuncha so'z tayyor turadi
  const LOOKAHEAD = 40;
  // Joriy so'z shu qatordan pastga tushsa, eng yuqori qator olib tashlanadi (Monkeytype kabi)
  const MAX_CURRENT_LINE = 1;
  // Oxirgi tugmadan shuncha vaqt o'tsa, vaqt WPM hisobiga qo'shilmaydi
  const IDLE_GAP_MS = 3000;
  // Rekord shuncha to'g'ri so'zdan keyin hisobga olinadi (boshidagi tasodifiy yuqori WPM bo'lmasligi uchun)
  const MIN_WORDS_FOR_BEST = 10;

  const LANGS = Object.keys(window.I18N);
  let lang = LANGS.includes(document.body.dataset.lang) ? document.body.dataset.lang : 'en';
  let T = window.I18N[lang];

  const $ = (id) => document.getElementById(id);
  const ui = {
    claude: $('claude-status'),
    claudeTitle: $('claude-title'),
    claudeSub: $('claude-sub'),
    sessions: $('sessions'),
    levels: $('levels'),
    progress: $('progress'),
    liveWpm: $('live-wpm'),
    trackFill: $('track-fill'),
    car: $('car'),
    wrap: $('words-wrap'),
    words: $('words'),
    caret: $('caret'),
    wpm: $('wpm'),
    acc: $('acc'),
    streak: $('streak'),
    best: $('best'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayText: $('overlay-text'),
    toast: $('toast'),
  };

  const game = {
    state: 'ready', // ready | playing | paused
    level: 0,
    levelWords: 0,
    words: [],
    results: [], // yozib bo'lingan so'zlar: { typed, ok }
    pos: 0,
    typed: '',
    correctChars: 0,
    keys: 0,
    goodKeys: 0,
    streak: 0,
    totalWords: 0,
    activeMs: 0,
    lastKeyAt: 0,
    lastTickAt: Date.now(),
    best: 0,
  };

  const escapeHtml = (s) =>
    s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // ---------- So'zlar ----------

  function pickWord(prev) {
    const list = LEVELS[game.level].words;
    let word;
    do {
      word = list[Math.floor(Math.random() * list.length)];
    } while (word === prev && list.length > 1);
    return word;
  }

  function topUp() {
    while (game.words.length - game.pos < LOOKAHEAD) game.words.push(pickWord(game.words[game.words.length - 1]));
  }

  // Daraja o'zgarganda hali yozilmagan so'zlarni yangi daraja so'zlariga almashtiradi
  function replaceUpcoming() {
    game.words.length = game.pos;
    topUp();
  }

  function setLevel(level) {
    game.level = level;
    game.levelWords = 0;
    game.typed = '';
    replaceUpcoming();
    renderLevels();
  }

  function reset() {
    Object.assign(game, {
      level: game.level,
      levelWords: 0,
      words: [],
      results: [],
      pos: 0,
      typed: '',
      correctChars: 0,
      keys: 0,
      goodKeys: 0,
      streak: 0,
      totalWords: 0,
      activeMs: 0,
      lastKeyAt: 0,
    });
    topUp();
  }

  // ---------- Chizish ----------

  function renderChars(target, typed, isCurrent) {
    const len = Math.max(target.length, typed.length);
    let html = '';
    for (let i = 0; i < len; i++) {
      let cls;
      let ch;
      if (i >= typed.length) [cls, ch] = ['', target[i]];
      else if (i >= target.length) [cls, ch] = ['extra', typed[i]];
      else [cls, ch] = [typed[i] === target[i] ? 'correct' : 'incorrect', target[i]];
      if (isCurrent && i === typed.length) cls += ' caret-at';
      html += `<span class="${cls}">${escapeHtml(ch)}</span>`;
    }
    return html;
  }

  function renderWords() {
    let html = '';
    game.words.forEach((word, i) => {
      if (i < game.pos) {
        const r = game.results[i];
        html += `<span class="word${r.ok ? '' : ' error'}">${renderChars(word, r.typed, false)}</span>`;
      } else if (i === game.pos) {
        html += `<span class="word active">${renderChars(word, game.typed, true)}</span>`;
      } else {
        html += `<span class="word">${escapeHtml(word)}</span>`;
      }
    });
    ui.words.innerHTML = html;
  }

  // Joriy so'z 3-qatorga tushsa, eng yuqori qatorni olib tashlaydi
  function scrollLines() {
    for (;;) {
      const nodes = ui.words.children;
      const tops = new Set();
      for (let i = 0; i <= game.pos && i < nodes.length; i++) tops.add(nodes[i].offsetTop);
      if (tops.size - 1 <= MAX_CURRENT_LINE) return;
      const firstTop = nodes[0].offsetTop;
      let n = 0;
      while (n < nodes.length && nodes[n].offsetTop === firstTop) n++;
      game.words.splice(0, n);
      game.results.splice(0, n);
      game.pos -= n;
      renderWords();
    }
  }

  function placeCaret() {
    const at = ui.words.querySelector('.caret-at');
    let x;
    let y;
    let h;
    if (at) {
      [x, y, h] = [at.offsetLeft, at.offsetTop, at.offsetHeight];
    } else {
      const last = ui.words.children[game.pos].lastElementChild;
      [x, y, h] = [last.offsetLeft + last.offsetWidth, last.offsetTop, last.offsetHeight];
    }
    ui.caret.style.height = `${h * 0.8}px`;
    ui.caret.style.transform = `translate(${x}px, ${y + h * 0.1}px)`;
  }

  function wpm() {
    if (game.activeMs < 3000) return 0;
    return Math.round(game.correctChars / 5 / (game.activeMs / 60000));
  }

  function renderStats() {
    const current = wpm();
    ui.progress.textContent = `${game.levelWords}/${WORDS_PER_LEVEL}`;
    ui.liveWpm.textContent = game.state === 'playing' && current ? current : '';
    ui.wpm.textContent = current;
    ui.acc.textContent = (game.keys ? Math.round((game.goodKeys / game.keys) * 100) : 100) + '%';
    ui.streak.textContent = game.streak;
    ui.best.textContent = game.best;
    const pct = (game.levelWords / WORDS_PER_LEVEL) * 100;
    ui.trackFill.style.width = `${pct}%`;
    ui.car.style.left = `${pct}%`;
  }

  function renderLevels() {
    ui.levels.innerHTML = LEVELS.map(
      (_l, i) => `<button class="level${i === game.level ? ' selected' : ''}" data-level="${i}">${i + 1} · ${escapeHtml(T.levels[i])}</button>`
    ).join('');
  }

  function render() {
    renderWords();
    scrollLines();
    placeCaret();
    renderStats();
  }

  let toastTimer;
  function toast(text) {
    ui.toast.textContent = text;
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 1800);
  }

  // ---------- Holatlar ----------

  // Overlay matni funksiya sifatida saqlanadi: til almashganda qayta chiziladi
  let overlayText = null;
  function showOverlay(textFn) {
    overlayText = textFn;
    const [title, text] = textFn();
    ui.overlayTitle.textContent = title;
    ui.overlayText.textContent = text;
    ui.wrap.classList.add('blurred');
  }

  function start() {
    game.state = 'playing';
    game.lastTickAt = Date.now();
    ui.wrap.classList.remove('blurred');
    acknowledgeNotice();
  }

  function pause(textFn) {
    if (game.state === 'ready') return;
    game.state = 'paused';
    showOverlay(textFn);
  }

  function levelUp() {
    game.levelWords = 0;
    if (game.level < LEVELS.length - 1) {
      game.level++;
      replaceUpcoming();
      renderLevels();
      toast(T.levelUp(game.level + 1, T.levels[game.level]));
    } else {
      toast(T.lastLevel);
    }
  }

  function submitWord() {
    const word = game.words[game.pos];
    const ok = game.typed === word;
    game.results[game.pos] = { typed: game.typed, ok };
    game.pos++;
    game.typed = '';
    if (ok) {
      game.correctChars += word.length + 1;
      game.streak++;
      game.levelWords++;
      game.totalWords++;
      if (game.levelWords >= WORDS_PER_LEVEL) levelUp();
    } else {
      game.streak = 0;
    }
    topUp();
    checkBest();
  }

  // Bo'sh so'zda Backspace bosilsa, oldingi xato so'zga qaytadi (Monkeytype kabi)
  function backToPreviousWord() {
    const prev = game.results[game.pos - 1];
    if (!prev || prev.ok) return false;
    game.pos--;
    game.typed = prev.typed;
    game.results.length = game.pos;
    return true;
  }

  function checkBest() {
    const current = wpm();
    if (game.totalWords >= MIN_WORDS_FOR_BEST && current > game.best) {
      game.best = current;
      vscode.postMessage({ type: 'best', value: current });
    }
  }

  // ---------- Klaviatura ----------

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.altKey || (e.ctrlKey && e.key !== 'Backspace')) return;

    if (e.key === 'Tab') {
      e.preventDefault();
      reset();
      start();
      render();
      return;
    }

    if (game.state === 'paused') {
      if (e.key === 'Enter') {
        e.preventDefault();
        start();
      }
      return;
    }
    if (game.state === 'ready') {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        start();
        return;
      }
      if (e.key.length !== 1) return;
      start();
    }

    if (e.key === 'Escape') {
      pause(() => [T.pause, T.pauseSub]);
      return;
    }

    if (e.key === 'Backspace') {
      if (!game.typed && !backToPreviousWord()) return;
      if (e.ctrlKey) game.typed = '';
      else if (game.typed) game.typed = game.typed.slice(0, -1);
    } else if (e.key === ' ') {
      if (game.typed) submitWord();
    } else if (e.key.length === 1) {
      game.keys++;
      if (e.key === game.words[game.pos][game.typed.length]) game.goodKeys++;
      game.typed += e.key;
    } else {
      return;
    }
    e.preventDefault();
    game.lastKeyAt = Date.now();
    ui.caret.classList.remove('blink');
    render();
  });

  ui.overlay.addEventListener('click', start);

  $('author').addEventListener('click', (e) => {
    e.currentTarget.blur();
    vscode.postMessage({ type: 'openAuthor' });
  });

  ui.levels.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-level]');
    if (!btn) return;
    setLevel(Number(btn.dataset.level));
    render();
    btn.blur();
  });

  window.addEventListener('resize', () => {
    renderWords();
    scrollLines();
    placeCaret();
  });

  setInterval(() => {
    const now = Date.now();
    if (game.state === 'playing' && now - game.lastKeyAt < IDLE_GAP_MS) game.activeMs += now - game.lastTickAt;
    game.lastTickAt = now;
    ui.caret.classList.toggle('blink', now - game.lastKeyAt > 1000);
    renderStats();
  }, 200);

  // ---------- Claude holati ----------

  let claudeWasActive = false;
  let claudeView = '';

  // Fon rangi va katta panel orqali holatni bildiradi: yozayotgan odam burchakka qaramaydi
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

  let claude = { status: 'idle', tool: '', sessions: [] };
  // Tugagan, lekin foydalanuvchi hali ko'rmagan sessiya (Enter bosilguncha ko'rsatiladi)
  let finishedNotice = null;

  const quote = (s) => `«${s.title}»`;

  function renderSessions() {
    const list = claude.sessions;
    // Bitta sessiya bo'lsa, ro'yxat kerak emas: katta panelning o'zi yetarli
    if (list.length < 2) {
      ui.sessions.innerHTML = '';
      return;
    }
    const label = T.state;
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
    pause(() => [T.finished(quote(session)), T.finishedOverlaySub]);
  }

  function onWaiting(session) {
    renderClaude();
    pause(() => [T.waiting(quote(session)), T.waitingOverlaySub]);
  }

  // ---------- Til ----------

  function applyStaticTexts() {
    document.documentElement.lang = lang;
    for (const el of document.querySelectorAll('[data-i18n]')) {
      el.textContent = el.dataset.i18n.split('.').reduce((o, k) => o[k], T);
    }
    $('author').title = T.authorTitle;
    for (const btn of document.querySelectorAll('[data-lang-option]')) {
      btn.classList.toggle('selected', btn.dataset.langOption === lang);
    }
  }

  function setLang(next) {
    if (!LANGS.includes(next)) return;
    lang = next;
    T = window.I18N[lang];
    applyStaticTexts();
    renderLevels();
    renderClaude();
    if (ui.wrap.classList.contains('blurred') && overlayText) showOverlay(overlayText);
  }

  $('langs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-lang-option]');
    if (!btn) return;
    btn.blur();
    setLang(btn.dataset.langOption);
    vscode.postMessage({ type: 'lang', value: lang });
  });

  // O'yin davom etganda "tugatdi" xabari ko'rilgan hisoblanadi
  function acknowledgeNotice() {
    if (!finishedNotice) return;
    finishedNotice = null;
    renderClaude();
  }

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type === 'init') {
      game.best = m.best || 0;
      renderStats();
    } else if (m.type === 'claude') {
      claude = m;
      renderClaude();
    } else if (m.type === 'finished') {
      onFinished(m);
    } else if (m.type === 'waiting') {
      onWaiting(m);
    }
  });

  reset();
  applyStaticTexts();
  renderClaude();
  renderLevels();
  render();
  showOverlay(() => [T.start, T.startSub]);
  vscode.postMessage({ type: 'ready' });
})();
