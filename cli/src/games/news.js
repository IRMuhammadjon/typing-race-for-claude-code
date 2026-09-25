// Yangiliklar tabi (terminal): Claude Code maslahatlari, retseptlar (tayyor kod) va viktorina, tanlangan tilda.
// O'yin emas (passive): boshlash ekrani yo'q, lekin "avval ish" qulfi unga ham amal qiladi.
const ID = 'news';
const MAX_WIDTH = 84;

// Mavzu ranglari webview'dagi bilan bir xil (media/games/news.js)
const CATS = {
  workflow: '#7fa8bf',
  shortcuts: '#e2b714',
  memory: '#a58fbf',
  hooks: '#e07a52',
  agents: '#8fbf7f',
  skills: '#d9a05a',
  mcp: '#6fb3b8',
  permissions: '#ca4754',
  automation: '#9a9a93',
  plugins: '#b48ead',
};
const LEVELS = ['all', 'beginner', 'advanced'];

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
  const filter = { level: 'all', cat: 'all' };

  const all = () => app.news || [];
  const pick = (field) => (field && (field[app.lang] || field.en)) || '';
  const kindOf = (it) => it.kind || 'tip';
  const levelOf = (it) => it.level || 'beginner';
  const catOf = (it) => (CATS[it.category] ? it.category : 'workflow');

  const visible = () =>
    all().filter(
      (it) => (filter.level === 'all' || levelOf(it) === filter.level) && (filter.cat === 'all' || catOf(it) === filter.cat)
    );

  // Claude hozir ishlatayotgan tool'ga mos maslahat (masalan, Bash -> ruxsatlar haqida)
  function related() {
    const busy = (app.claudeState().sessions || []).find((s) => s.status === 'busy' && s.tool);
    if (!busy) return null;
    const it = all().find((x) => (x.tools || []).includes(busy.tool));
    return it ? { it, tool: busy.tool } : null;
  }

  function current() {
    const list = visible();
    if (!list.length) return null;
    index = (index + list.length) % list.length;
    return list[index];
  }

  function cycle(group) {
    const values = group === 'level' ? LEVELS : ['all', ...Object.keys(CATS).filter((c) => all().some((it) => catOf(it) === c))];
    filter[group] = values[(values.indexOf(filter[group]) + 1) % values.length];
    index = 0;
  }

  function answer(choice) {
    const it = current();
    if (!it || kindOf(it) !== 'quiz' || app.newsQuiz[it.id] !== undefined || choice >= (it.options || []).length) return false;
    app.answerQuiz(it.id, choice);
    return true;
  }

  return {
    id: ID,
    labelKey: 'news',
    aliases: ['news', 'tips'],
    passive: true,

    reset() {},

    key(k) {
      const ch = k.name === 'char' ? k.ch.toLowerCase() : '';
      if (k.name === 'left' || k.name === 'up') index--;
      else if (k.name === 'right' || k.name === 'down' || k.name === 'space') index++;
      else if (ch >= '1' && ch <= '4') return answer(Number(ch) - 1);
      else if (ch === 'o') {
        const it = current();
        if (it && it.link) app.openUrl(it.link);
      } else if (ch === 'c') {
        const it = current();
        if (!it || !it.code) return false;
        app.copy(it.code);
        app.toast(app.T.newsCopied);
      } else if (ch === 'f') cycle('level');
      else if (ch === 'g') cycle('cat');
      else if (ch === 'r') {
        const rel = related();
        if (!rel) return false;
        filter.level = 'all';
        filter.cat = 'all';
        index = Math.max(0, visible().indexOf(rel.it));
      } else return false;
      return true;
    },

    draw(s, box, C) {
      const T = app.T;
      const w = Math.min(box.w, MAX_WIDTH);
      const x = box.x + Math.floor((box.w - w) / 2);
      const inner = w - 5;
      const bottom = box.y + box.h;
      let y = box.y;

      // Filtrlar: f daraja, g mavzu
      const levelLabel = filter.level === 'all' ? T.newsAll : T.newsLevel[filter.level];
      const catLabel = filter.cat === 'all' ? T.newsAll : T.newsCat[filter.cat];
      let fx = x;
      fx += s.text(fx, y, 'f ', { fg: C.sub });
      fx += s.text(fx, y, ` ${levelLabel} `, { fg: C.main, bg: C.alt }) + 2;
      fx += s.text(fx, y, 'g ', { fg: C.sub });
      s.text(fx, y, ` ${catLabel} `, { fg: filter.cat === 'all' ? C.main : CATS[filter.cat], bg: C.alt });

      const list = visible();
      const it = current();
      y += 2;
      if (!it) {
        s.text(x, y, all().length ? T.newsNoMatch : T.newsEmpty, { fg: C.sub });
        return;
      }
      const isNew = !app.newsRead.has(it.id);
      app.markNewsRead(it.id);

      // Hisoblagich, statistika va navigatsiya
      const quizzes = list.filter((q) => kindOf(q) === 'quiz');
      const right = quizzes.filter((q) => app.newsQuiz[q.id] === q.answer).length;
      const stats = [T.newsRead(list.filter((q) => app.newsRead.has(q.id)).length, list.length)];
      if (quizzes.length) stats.push(T.newsQuizScore(right, quizzes.length));
      let hx = x + s.text(x, y, `${index + 1} / ${list.length}`, { fg: C.text }) + 3;
      s.text(hx, y, stats.join(' · ').slice(0, w - hx + x - 6), { fg: C.sub });
      s.text(x + w - 4, y, '← →', { fg: C.sub });
      y += 1;
      // Progress chizig'i
      const done = Math.round((w * (index + 1)) / list.length);
      s.text(x, y, '━'.repeat(done), { fg: C.main });
      s.text(x + done, y, '━'.repeat(w - done), { fg: C.alt });
      y += 2;

      // Kartochka mazmuni oldindan qatorlarga yig'iladi, keyin balandligi ma'lum bo'ladi
      const kind = kindOf(it);
      const cat = catOf(it);
      const rows = [];
      const add = (text, style) => rows.push({ text, style });
      const title = wrap(pick(it.title), inner);
      const chosen = app.newsQuiz[it.id];
      rows.push({ meta: true });
      rows.push({ blank: true });
      for (const line of title) add(line, { fg: C.text, bold: true });
      rows.push({ blank: true });
      if (kind === 'quiz') {
        (it.options || []).forEach((o, i) => {
          const answered = chosen !== undefined;
          const fg = !answered ? C.text : i === it.answer ? C.done : i === chosen ? C.error : C.sub;
          const mark = answered && i === it.answer ? '✓' : answered && i === chosen ? '✗' : ' ';
          for (const [n, line] of wrap(pick(o), inner - 6).entries()) {
            add(`${n ? '    ' : `${i + 1}  `}${line}${n ? '' : `  ${mark}`}`.trimEnd(), { fg, bold: answered && i === it.answer });
          }
        });
        rows.push({ blank: true });
        if (chosen === undefined) add(T.newsQuizHint, { fg: C.sub });
        else {
          const ok = chosen === it.answer;
          add(ok ? T.newsQuizRight : T.newsQuizWrong(pick(it.options[it.answer])), { fg: ok ? C.done : C.error, bold: true });
          for (const line of wrap(pick(it.body), inner)) add(line, { fg: C.text });
        }
      } else {
        for (const line of wrap(pick(it.body), inner)) add(line, { fg: C.text });
        if (kind === 'recipe' && it.code) {
          rows.push({ blank: true });
          rows.push({ codeHead: true });
          for (const line of it.code.split('\n')) rows.push({ code: line });
        } else if (it.command) {
          rows.push({ blank: true });
          rows.push({ code: it.command });
        }
      }
      if (it.link) {
        rows.push({ blank: true });
        add(`o  ${it.link}`, { fg: C.sub });
      }

      // Joy yetmasa kartochka pastdan kesiladi (tavsiya qatori uchun 2 qator qoldiriladi)
      const maxRows = Math.max(3, bottom - y - 4);
      const shown = rows.slice(0, maxRows);
      const cardH = shown.length + 2;
      s.fill(x, y, w, cardH, C.alt);
      s.fill(x, y, 1, cardH, CATS[cat]);
      let cy = y + 1;
      const cx = x + 3;
      for (const row of shown) {
        if (row.meta) {
          let mx = cx;
          mx += s.text(mx, cy, T.newsCat[cat], { fg: CATS[cat], bg: C.alt, bold: true }) + 2;
          mx += s.text(mx, cy, `${T.newsKind[kind]}`, { fg: C.sub, bg: C.alt }) + 2;
          mx += s.text(mx, cy, T.newsLevel[levelOf(it)], { fg: levelOf(it) === 'advanced' ? C.warn : C.sub, bg: C.alt }) + 2;
          if (isNew) mx += s.text(mx, cy, ` ${T.newsNew} `, { fg: C.bg, bg: C.main, bold: true }) + 2;
          if (it.source === 'changelog') s.text(mx, cy, T.newsChangelog, { fg: C.sub, bg: C.alt });
          if (it.date) s.text(x + w - 2 - it.date.length, cy, it.date, { fg: C.sub, bg: C.alt });
        } else if (row.codeHead) {
          s.fill(cx, cy, inner, 1, C.bg);
          const where = it.where ? `${T.newsWhere}: ${it.where}` : it.codeLang || '';
          s.text(cx + 1, cy, where.slice(0, inner - 12), { fg: C.sub, bg: C.bg });
          const copy = `c ${T.newsCopy}`;
          s.text(cx + inner - copy.length - 1, cy, copy, { fg: C.main, bg: C.bg });
        } else if (row.code !== undefined) {
          s.fill(cx, cy, inner, 1, C.bg);
          const line = row.code.length > inner - 2 ? `${row.code.slice(0, inner - 3)}…` : row.code;
          s.text(cx + 1, cy, line, { fg: row.code.trim().startsWith('#') ? C.sub : C.main, bg: C.bg });
        } else if (!row.blank) {
          s.text(cx, cy, row.text.slice(0, inner), { ...row.style, bg: C.alt });
        }
        cy++;
      }
      y += cardH + 1;

      const rel = related();
      if (rel && rel.it !== it && y < bottom) {
        const text = `r  ${T.newsRelated(rel.tool)}: ${pick(rel.it.title)}`;
        s.text(x, y, text.slice(0, w), { fg: C.main });
      }
    },

    startText: () => ['', ''],
    hints: (T) => [
      ['← →', `${T.keys.prev} / ${T.keys.nextTip}`],
      ['1 2 3', T.keys.answer],
      ['c', T.keys.copy],
      ['f g', T.keys.filter],
      ['o', T.keys.open],
      ['r', T.keys.related],
    ],
  };
};
