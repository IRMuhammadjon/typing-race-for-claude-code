// Yangiliklar tabi: Claude Code maslahatlari, retseptlar (tayyor kod) va viktorina, tanlangan tilda.
// O'yin emas: boshlash ekrani yo'q (passive), lekin "avval ish" qulfi unga ham amal qiladi.
(function () {
  const App = window.App;
  const ID = 'news';
  const escapeHtml = App.escapeHtml;

  // Mavzular: ikonka va rang (kartochkaning chap chizig'i va belgisi)
  const CATS = {
    workflow: ['🔁', '#7fa8bf'],
    shortcuts: ['⌨', '#e2b714'],
    memory: ['📘', '#a58fbf'],
    hooks: ['🪝', '#e07a52'],
    agents: ['🤖', '#8fbf7f'],
    skills: ['🛠', '#d9a05a'],
    mcp: ['🔌', '#6fb3b8'],
    permissions: ['🔐', '#ca4754'],
    automation: ['⚙', '#9a9a93'],
    plugins: ['🧩', '#b48ead'],
  };
  const KIND_ICON = { tip: '💡', recipe: '🧪', quiz: '🧠' };
  const LEVELS = ['all', 'beginner', 'advanced'];

  let ui;
  let index = 0;
  let direction = 0;
  let read = null;
  const filter = { level: 'all', cat: 'all' };

  const all = () => App.news || [];
  const pick = (field) => (field && (field[App.lang] || field.en)) || '';
  const kindOf = (it) => it.kind || 'tip';
  const levelOf = (it) => it.level || 'beginner';
  const catOf = (it) => (CATS[it.category] ? it.category : 'workflow');
  const answers = () => App.newsQuiz || {};

  function visible() {
    return all().filter(
      (it) => (filter.level === 'all' || levelOf(it) === filter.level) && (filter.cat === 'all' || catOf(it) === filter.cat)
    );
  }

  // Claude hozir ishlatayotgan tool'ga mos maslahat (masalan, Bash -> ruxsatlar haqida)
  function related() {
    const busy = (App.claudeState().sessions || []).find((s) => s.status === 'busy' && s.tool);
    if (!busy) return null;
    const it = all().find((x) => kindOf(x) !== 'quiz' && (x.tools || []).includes(busy.tool));
    return it ? { it, tool: busy.tool } : null;
  }

  function markRead(item) {
    if (read.has(item.id)) return;
    read.add(item.id);
    App.post({ type: 'newsRead', id: item.id });
  }

  // Kodni sodda ranglash: JSON kalit/qiymatlari, YAML frontmatter kalitlari, bash izohlari
  function highlight(code, lang) {
    if (lang === 'json') {
      let html = '';
      let last = 0;
      const re = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null|\d+)\b/g;
      let m;
      while ((m = re.exec(code))) {
        html += escapeHtml(code.slice(last, m.index));
        if (m[1]) html += `<span class="${m[2] ? 'hl-key' : 'hl-str'}">${escapeHtml(m[1])}</span>${m[2] ? escapeHtml(m[2]) : ''}`;
        else html += `<span class="hl-num">${escapeHtml(m[3])}</span>`;
        last = re.lastIndex;
      }
      return html + escapeHtml(code.slice(last));
    }
    return code
      .split('\n')
      .map((line) => {
        if (/^\s*#/.test(line) && lang === 'bash') return `<span class="hl-com">${escapeHtml(line)}</span>`;
        if (line.trim() === '---') return `<span class="hl-com">${escapeHtml(line)}</span>`;
        const kv = /^(\s*)([\w-]+)(:)(.*)$/.exec(line);
        if (kv && (lang === 'yaml' || lang === 'markdown')) {
          return `${kv[1]}<span class="hl-key">${escapeHtml(kv[2])}</span>${kv[3]}<span class="hl-str">${escapeHtml(kv[4])}</span>`;
        }
        return escapeHtml(line);
      })
      .join('\n');
  }

  function renderFilters() {
    const T = App.T;
    const list = all();
    const cats = Object.keys(CATS).filter((c) => list.some((it) => catOf(it) === c));
    const chip = (group, value, label, count) =>
      `<button class="chip${filter[group] === value ? ' on' : ''}" data-filter="${group}" data-value="${value}">${escapeHtml(label)}${
        count !== undefined ? `<span class="chip-n">${count}</span>` : ''
      }</button>`;
    ui.filters.innerHTML = `
      <div class="chips">${LEVELS.map((l) => chip('level', l, l === 'all' ? T.newsAll : T.newsLevel[l])).join('')}</div>
      <div class="chips">${chip('cat', 'all', T.newsAll)}${cats
        .map((c) => chip('cat', c, `${CATS[c][0]} ${T.newsCat[c]}`, list.filter((it) => catOf(it) === c).length))
        .join('')}</div>`;
    const quizzes = list.filter((it) => kindOf(it) === 'quiz');
    const right = quizzes.filter((q) => answers()[q.id] === q.answer).length;
    ui.stats.textContent = [
      T.newsRead(list.filter((it) => read.has(it.id)).length, list.length),
      quizzes.length ? T.newsQuizScore(right, quizzes.length) : '',
    ]
      .filter(Boolean)
      .join('  ·  ');
  }

  function renderQuiz(it) {
    const T = App.T;
    const chosen = answers()[it.id];
    const done = chosen !== undefined;
    const opts = (it.options || [])
      .map((o, i) => {
        const cls = !done ? '' : i === it.answer ? ' right' : i === chosen ? ' wrong' : ' dim';
        return `<button class="quiz-opt${cls}" data-answer="${i}"${done ? ' disabled' : ''}><kbd>${i + 1}</kbd><span>${escapeHtml(pick(o))}</span></button>`;
      })
      .join('');
    const result = !done
      ? `<p class="quiz-hint">${escapeHtml(T.newsQuizHint)}</p>`
      : `<p class="quiz-result ${chosen === it.answer ? 'ok' : 'bad'}">${escapeHtml(
          chosen === it.answer ? T.newsQuizRight : T.newsQuizWrong(pick(it.options[it.answer]))
        )}</p><p class="news-body">${escapeHtml(pick(it.body))}</p>`;
    return `<div class="quiz">${opts}</div>${result}`;
  }

  function render() {
    if (!ui) return;
    if (!read) read = new Set();
    for (const id of App.newsRead || []) read.add(id);
    renderFilters();

    const list = visible();
    const T = App.T;
    if (!list.length) {
      ui.counter.textContent = '';
      ui.bar.style.width = '0';
      ui.card.innerHTML = `<div class="news-empty">${escapeHtml(all().length ? T.newsNoMatch : T.newsEmpty)}</div>`;
      ui.related.innerHTML = '';
      return;
    }
    index = (index + list.length) % list.length;
    const it = list[index];
    const kind = kindOf(it);
    const cat = catOf(it);
    const [icon, color] = CATS[cat];
    ui.counter.textContent = `${index + 1} / ${list.length}`;
    ui.bar.style.width = `${((index + 1) / list.length) * 100}%`;

    const meta = [
      `<span class="news-cat">${icon} ${escapeHtml(T.newsCat[cat])}</span>`,
      `<span class="news-kind">${KIND_ICON[kind]} ${escapeHtml(T.newsKind[kind])}</span>`,
      `<span class="news-level lvl-${levelOf(it)}">${escapeHtml(T.newsLevel[levelOf(it)])}</span>`,
      !read.has(it.id) ? `<span class="news-badge">${escapeHtml(T.newsNew)}</span>` : '',
      it.source === 'changelog' ? `<span class="news-src">${escapeHtml(T.newsChangelog)}</span>` : '',
      it.date ? `<span class="news-date">${escapeHtml(it.date)}</span>` : '',
    ].join('');

    let bodyHtml = '';
    if (kind === 'quiz') {
      bodyHtml = renderQuiz(it);
    } else {
      bodyHtml = `<p class="news-body">${escapeHtml(pick(it.body))}</p>`;
      if (kind === 'recipe' && it.code) {
        bodyHtml += `
          <div class="news-code">
            <div class="news-code-head">
              <span>${it.where ? `${escapeHtml(T.newsWhere)}: <b>${escapeHtml(it.where)}</b>` : escapeHtml(it.codeLang || '')}</span>
              <button class="news-copy" data-copy>📋 ${escapeHtml(T.newsCopy)}</button>
            </div>
            <pre>${highlight(it.code, it.codeLang)}</pre>
          </div>`;
      } else if (it.command) {
        bodyHtml += `<pre class="news-cmd">${escapeHtml(it.command)}</pre>`;
      }
    }

    ui.card.style.setProperty('--cat', color);
    ui.card.innerHTML = `
      <div class="news-meta">${meta}</div>
      <h2 class="news-title">${escapeHtml(pick(it.title))}</h2>
      ${bodyHtml}
      ${it.link ? `<button class="news-link" data-link>${escapeHtml(T.keys.open)} ↗</button>` : ''}`;
    // Kartochka almashganda yumshoq kirish animatsiyasi
    ui.card.classList.remove('from-left', 'from-right');
    void ui.card.offsetWidth;
    if (direction) ui.card.classList.add(direction > 0 ? 'from-right' : 'from-left');
    direction = 0;

    // Viktorina javob berilganda o'qilgan hisoblanadi, qolganlari ko'rilishi bilan
    if (kind !== 'quiz') markRead(it);

    const rel = related();
    ui.related.innerHTML =
      rel && rel.it.id !== it.id
        ? `<button class="news-related" data-jump="${escapeHtml(rel.it.id)}">💡 ${escapeHtml(T.newsRelated(rel.tool))}: ${escapeHtml(pick(rel.it.title))}</button>`
        : '';
  }

  function current() {
    const list = visible();
    return list.length ? list[(index + list.length) % list.length] : null;
  }

  function go(delta) {
    index += delta;
    direction = delta;
    render();
  }

  function setFilter(group, value) {
    filter[group] = value;
    index = 0;
    render();
  }

  function cycleFilter(group) {
    const values = group === 'level' ? LEVELS : ['all', ...Object.keys(CATS).filter((c) => all().some((it) => catOf(it) === c))];
    setFilter(group, values[(values.indexOf(filter[group]) + 1) % values.length]);
  }

  function jumpTo(id) {
    filter.level = 'all';
    filter.cat = 'all';
    index = Math.max(0, visible().findIndex((it) => it.id === id));
    render();
  }

  function answer(choice) {
    const it = current();
    if (!it || kindOf(it) !== 'quiz' || answers()[it.id] !== undefined || !it.options || choice >= it.options.length) return false;
    App.newsQuiz = { ...answers(), [it.id]: choice };
    App.post({ type: 'quizAnswer', id: it.id, choice });
    markRead(it);
    render();
    return true;
  }

  function copyCode() {
    const it = current();
    if (!it || !it.code) return false;
    App.post({ type: 'copy', text: it.code });
    App.toast(App.T.newsCopied);
    return true;
  }

  function openLink() {
    const it = current();
    if (it && it.link) App.post({ type: 'openLink', url: it.link });
  }

  function mount(root) {
    root.innerHTML = `
      <div class="news-filters" data-ref="filters"></div>
      <div class="news-head">
        <span class="news-counter" data-ref="counter"></span>
        <span class="news-stats" data-ref="stats"></span>
        <div class="news-nav">
          <button data-nav="-1" aria-label="previous">←</button>
          <button data-nav="1" aria-label="next">→</button>
        </div>
      </div>
      <div class="news-progress"><div data-ref="bar"></div></div>
      <article class="news-card" data-ref="card"></article>
      <div class="news-related-wrap" data-ref="related"></div>`;
    ui = App.refs(root);
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-nav],[data-link],[data-jump],[data-filter],[data-answer],[data-copy]');
      if (!el) return;
      el.blur();
      if (el.dataset.nav) go(Number(el.dataset.nav));
      else if (el.dataset.link !== undefined) openLink();
      else if (el.dataset.jump) jumpTo(el.dataset.jump);
      else if (el.dataset.filter) setFilter(el.dataset.filter, el.dataset.value);
      else if (el.dataset.answer !== undefined) answer(Number(el.dataset.answer));
      else if (el.dataset.copy !== undefined) copyCode();
    });
  }

  App.register({
    id: ID,
    labelKey: 'news',
    icon: '📰',
    passive: true,
    mount,
    show: render,
    reset() {},
    keydown(e) {
      const k = e.key.toLowerCase();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(-1);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') go(1);
      else if (['1', '2', '3', '4'].includes(e.key)) return answer(Number(e.key) - 1);
      else if (k === 'c') return copyCode();
      else if (k === 'o') openLink();
      else if (k === 'f') cycleFilter('level');
      else if (k === 'g') cycleFilter('cat');
      else if (k === 'r') {
        const rel = related();
        if (!rel) return false;
        jumpTo(rel.it.id);
      } else return false;
      return true;
    },
    startsOn: () => false,
    startText: () => ['', ''],
    hints: () => [
      ['← →', `${App.T.keys.prev} / ${App.T.keys.nextTip}`],
      ['1 2 3', App.T.keys.answer],
      ['c', App.T.keys.copy],
      ['f g', App.T.keys.filter],
      ['o', App.T.keys.open],
      ['r', App.T.keys.related],
    ],
    relabel: render,
    refresh: render,
  });
})();
