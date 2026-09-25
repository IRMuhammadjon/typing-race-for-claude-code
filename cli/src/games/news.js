// Yangiliklar tabi (terminal): Claude Code maslahatlari tanlangan tilda. O'yin emas (passive):
// boshlash ekrani yo'q, lekin "avval ish" qulfi unga ham amal qiladi.
const ID = 'news';
const MAX_WIDTH = 78;

// Matnni kenglikka qarab qatorlarga bo'ladi
function wrap(text, width) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    if (!word) continue;
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

module.exports = function createNews(app) {
  let index = 0;

  const items = () => app.news || [];
  const pick = (field) => (field && (field[app.lang] || field.en)) || '';

  // Claude hozir ishlatayotgan tool'ga mos maslahat (masalan, Bash -> ruxsatlar haqida)
  function related() {
    const busy = (app.claudeState().sessions || []).find((s) => s.status === 'busy' && s.tool);
    if (!busy) return null;
    const i = items().findIndex((it) => (it.tools || []).includes(busy.tool));
    return i >= 0 ? { i, tool: busy.tool } : null;
  }

  function current() {
    const list = items();
    if (!list.length) return null;
    index = (index + list.length) % list.length;
    return list[index];
  }

  return {
    id: ID,
    labelKey: 'news',
    aliases: ['news', 'tips'],
    passive: true,

    reset() {},

    key(k) {
      if (k.name === 'left' || k.name === 'up') index--;
      else if (k.name === 'right' || k.name === 'down' || k.name === 'space') index++;
      else if (k.name === 'char' && 'oO'.includes(k.ch)) {
        const it = current();
        if (it && it.link) app.openUrl(it.link);
      } else if (k.name === 'char' && 'rR'.includes(k.ch)) {
        const rel = related();
        if (!rel) return false;
        index = rel.i;
      } else return false;
      return true;
    },

    draw(s, box, C) {
      const T = app.T;
      const it = current();
      const w = Math.min(box.w, MAX_WIDTH);
      const x = box.x + Math.floor((box.w - w) / 2);
      if (!it) {
        s.text(x, box.y + 2, T.newsEmpty, { fg: C.sub });
        return;
      }
      const isNew = !app.newsRead.has(it.id);
      app.markNewsRead(it.id);

      const title = wrap(pick(it.title), w - 4);
      const body = wrap(pick(it.body), w - 4);
      const cardH = 2 + title.length + 1 + body.length + (it.command ? 2 : 0) + (it.link ? 2 : 0) + 1;
      let y = box.y + Math.max(0, Math.floor((box.h - cardH - 4) / 2));

      // Hisoblagich va navigatsiya
      s.text(x, y, `${index + 1} / ${items().length}`, { fg: C.sub });
      const nav = '←  →';
      s.text(x + w - nav.length, y, nav, { fg: C.sub });
      y += 2;

      s.fill(x, y, w, cardH, C.alt);
      let cy = y + 1;
      let mx = x + 2;
      if (isNew) mx += s.text(mx, cy, ` ${T.newsNew} `, { fg: C.bg, bg: C.main, bold: true }) + 1;
      if (it.source === 'changelog') mx += s.text(mx, cy, T.newsChangelog, { fg: C.sub, bg: C.alt }) + 2;
      if (it.date) s.text(x + w - 2 - it.date.length, cy, it.date, { fg: C.sub, bg: C.alt });
      cy += 1;
      for (const line of title) s.text(x + 2, cy++, line, { fg: C.text, bg: C.alt, bold: true });
      cy++;
      for (const line of body) s.text(x + 2, cy++, line, { fg: C.text, bg: C.alt });
      if (it.command) {
        cy++;
        s.fill(x + 2, cy, w - 4, 1, C.bg);
        s.text(x + 3, cy++, it.command.slice(0, w - 6), { fg: C.main, bg: C.bg });
      }
      if (it.link) {
        cy++;
        s.text(x + 2, cy++, `o  ${it.link}`.slice(0, w - 4), { fg: C.sub, bg: C.alt });
      }
      y += cardH + 1;

      const rel = related();
      if (rel && rel.i !== index) {
        const text = `r  ${T.newsRelated(rel.tool)}: ${pick(items()[rel.i].title)}`;
        s.text(x, y, text.slice(0, w), { fg: C.main });
      }
    },

    startText: () => ['', ''],
    hints: (T) => [
      ['← →', `${T.keys.prev} / ${T.keys.nextTip}`],
      ['o', T.keys.open],
      ['r', T.keys.related],
    ],
  };
};
