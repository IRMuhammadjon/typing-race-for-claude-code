// Typing Race: Monkeytype uslubidagi so'z terish, oson so'zlardan boshlanadi
(function () {
  const App = window.App;
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
  const ID = 'typing';

  let ui;
  const game = {
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
  };

  const escapeHtml = App.escapeHtml;
  const playing = () => App.isPlaying(ID);

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
    ui.liveWpm.textContent = playing() && current ? current : '';
    ui.wpm.textContent = current;
    ui.acc.textContent = (game.keys ? Math.round((game.goodKeys / game.keys) * 100) : 100) + '%';
    ui.streak.textContent = game.streak;
    ui.best.textContent = App.best[ID] || 0;
    const pct = (game.levelWords / WORDS_PER_LEVEL) * 100;
    ui.trackFill.style.width = `${pct}%`;
    ui.car.style.left = `${pct}%`;
  }

  function renderLevels() {
    ui.levels.innerHTML = LEVELS.map(
      (_l, i) =>
        `<button class="level${i === game.level ? ' selected' : ''}" data-level="${i}">${i + 1} · ${escapeHtml(App.T.levels[i])}</button>`
    ).join('');
  }

  function render() {
    // Yashirin bo'lsa o'lchab bo'lmaydi: ko'rsatilganda qayta chiziladi
    if (App.active !== ID) return;
    renderWords();
    scrollLines();
    placeCaret();
    renderStats();
  }

  // ---------- O'yin mantiqi ----------

  function levelUp() {
    game.levelWords = 0;
    if (game.level < LEVELS.length - 1) {
      game.level++;
      replaceUpcoming();
      renderLevels();
      App.toast(App.T.levelUp(game.level + 1, App.T.levels[game.level]));
    } else {
      App.toast(App.T.lastLevel);
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
    if (game.totalWords >= MIN_WORDS_FOR_BEST) App.saveBest(ID, wpm());
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

  function keydown(e) {
    if (e.key === 'Backspace') {
      if (!game.typed && !backToPreviousWord()) return false;
      if (e.ctrlKey) game.typed = '';
      else if (game.typed) game.typed = game.typed.slice(0, -1);
    } else if (e.key === ' ') {
      if (game.typed) submitWord();
    } else if (e.key.length === 1) {
      game.keys++;
      if (e.key === game.words[game.pos][game.typed.length]) game.goodKeys++;
      game.typed += e.key;
    } else {
      return false;
    }
    game.lastKeyAt = Date.now();
    ui.caret.classList.remove('blink');
    render();
    return true;
  }

  function mount(root) {
    root.innerHTML = `
      <div class="levels" data-ref="levels"></div>
      <div class="live"><span data-ref="progress"></span><span class="wpm" data-ref="liveWpm"></span></div>
      <div class="track"><div class="track-fill" data-ref="trackFill"></div><span class="car" data-ref="car">🏎️</span></div>
      <div class="words-wrap">
        <div class="words" data-ref="words"></div>
        <div class="caret" data-ref="caret"></div>
      </div>
      <div class="stats">
        <div class="stat"><span class="label" data-i18n="stats.wpm"></span><span class="value" data-ref="wpm">0</span></div>
        <div class="stat"><span class="label" data-i18n="stats.acc"></span><span class="value" data-ref="acc">100%</span></div>
        <div class="stat"><span class="label" data-i18n="stats.streak"></span><span class="value" data-ref="streak">0</span></div>
        <div class="stat"><span class="label" data-i18n="stats.best"></span><span class="value" data-ref="best">0</span></div>
      </div>`;
    ui = App.refs(root);

    ui.levels.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-level]');
      if (!btn) return;
      btn.blur();
      setLevel(Number(btn.dataset.level));
      render();
    });

    setInterval(() => {
      const now = Date.now();
      if (playing() && now - game.lastKeyAt < IDLE_GAP_MS) game.activeMs += now - game.lastTickAt;
      game.lastTickAt = now;
      ui.caret.classList.toggle('blink', now - game.lastKeyAt > 1000);
      if (App.active === ID) renderStats();
    }, 200);

    reset();
  }

  App.register({
    id: ID,
    labelKey: 'typing',
    icon: '⌨',
    mount,
    show: render,
    resize: render,
    start() {
      game.lastTickAt = Date.now();
    },
    reset() {
      reset();
      render();
    },
    keydown,
    // Birinchi harf o'yinni boshlaydi va o'zi ham yoziladi
    startsOn: (e) => e.key.length === 1 && e.key !== ' ',
    startText: () => [App.T.start, App.T.startSub],
    hints: () => [
      ['tab', App.T.keys.restart],
      ['esc', App.T.keys.pause],
      ['enter', App.T.keys.resume],
      ['backspace', App.T.keys.back],
    ],
    relabel: renderLevels,
    refresh() {
      if (ui) renderStats();
    },
  });
})();
