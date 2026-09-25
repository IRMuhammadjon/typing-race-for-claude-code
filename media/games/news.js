// Yangiliklar tabi: Claude Code maslahatlari, tanlangan tilda. O'yin emas: boshlash ekrani yo'q (passive),
// lekin "avval ish" qulfi unga ham amal qiladi.
(function () {
  const App = window.App;
  const ID = 'news';
  const escapeHtml = App.escapeHtml;

  let ui;
  let index = 0;
  let read = null;

  const items = () => App.news || [];
  const pick = (field) => (field && (field[App.lang] || field.en)) || '';

  // Claude hozir ishlatayotgan tool'ga mos maslahat (masalan, Bash -> ruxsatlar haqida)
  function related() {
    const busy = (App.claudeState().sessions || []).find((s) => s.status === 'busy' && s.tool);
    if (!busy) return null;
    const i = items().findIndex((it) => (it.tools || []).includes(busy.tool));
    return i >= 0 ? { i, tool: busy.tool } : null;
  }

  function markRead(item) {
    if (read.has(item.id)) return;
    read.add(item.id);
    App.post({ type: 'newsRead', id: item.id });
  }

  function render() {
    if (!ui) return;
    // O'qilganlar ro'yxati extension'dan tab birinchi chizilganidan keyin kelishi mumkin
    if (!read) read = new Set();
    for (const id of App.newsRead || []) read.add(id);
    const list = items();
    if (!list.length) {
      ui.counter.textContent = '';
      ui.card.innerHTML = `<div class="news-empty">${escapeHtml(App.T.newsEmpty)}</div>`;
      ui.related.innerHTML = '';
      return;
    }
    index = (index + list.length) % list.length;
    const it = list[index];
    const badges = [
      !read.has(it.id) ? `<span class="news-badge">${escapeHtml(App.T.newsNew)}</span>` : '',
      it.source === 'changelog' ? `<span class="news-src">${escapeHtml(App.T.newsChangelog)}</span>` : '',
      it.date ? `<span class="news-date">${escapeHtml(it.date)}</span>` : '',
    ].join('');
    ui.counter.textContent = `${index + 1} / ${list.length}`;
    ui.card.innerHTML = `
      <div class="news-meta">${badges}</div>
      <h2 class="news-title">${escapeHtml(pick(it.title))}</h2>
      <p class="news-body">${escapeHtml(pick(it.body))}</p>
      ${it.command ? `<pre class="news-cmd">${escapeHtml(it.command)}</pre>` : ''}
      ${it.link ? `<button class="news-link" data-link="${escapeHtml(it.link)}">${escapeHtml(App.T.keys.open)} ↗</button>` : ''}`;
    // "yangi" belgisi birinchi ko'rishda turadi, keyingi safar yo'qoladi
    markRead(it);

    const rel = related();
    ui.related.innerHTML =
      rel && rel.i !== index
        ? `<button class="news-related" data-jump="${rel.i}">💡 ${escapeHtml(App.T.newsRelated(rel.tool))}: ${escapeHtml(pick(list[rel.i].title))}</button>`
        : '';
  }

  function go(delta) {
    index += delta;
    render();
  }

  function openLink() {
    const it = items()[index];
    if (it && it.link) App.post({ type: 'openLink', url: it.link });
  }

  function mount(root) {
    root.innerHTML = `
      <div class="news-head">
        <span class="news-counter" data-ref="counter"></span>
        <div class="news-nav">
          <button data-nav="-1" aria-label="previous">←</button>
          <button data-nav="1" aria-label="next">→</button>
        </div>
      </div>
      <article class="news-card" data-ref="card"></article>
      <div class="news-related-wrap" data-ref="related"></div>`;
    ui = App.refs(root);
    root.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      const link = e.target.closest('[data-link]');
      const jump = e.target.closest('[data-jump]');
      if (nav) go(Number(nav.dataset.nav));
      else if (link) openLink();
      else if (jump) {
        index = Number(jump.dataset.jump);
        render();
      }
      if (nav || link || jump) e.target.blur();
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
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(-1);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') go(1);
      else if (e.key === 'o' || e.key === 'O') openLink();
      else if (e.key === 'r' || e.key === 'R') {
        const rel = related();
        if (!rel) return false;
        index = rel.i;
        render();
      } else return false;
      return true;
    },
    startsOn: () => false,
    startText: () => ['', ''],
    hints: () => [
      ['← →', `${App.T.keys.prev} / ${App.T.keys.nextTip}`],
      ['o', App.T.keys.open],
      ['r', App.T.keys.related],
    ],
    relabel: render,
    refresh: render,
  });
})();
