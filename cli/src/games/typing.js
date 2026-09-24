// Typing Race (terminal): Monkeytype uslubidagi so'z terish, oson so'zlardan boshlanadi.
// Mantiq media/games/typing.js bilan bir xil, faqat terminal kataklariga chiziladi.
const shared = require('../shared');

const LEVELS = shared('words');
const WORDS_PER_LEVEL = 15;
// Keng terminalda ham 3 qator to'lishi uchun oldindan tayyorlanadigan so'zlar
const LOOKAHEAD = 70;
// Joriy so'z shu qatordan pastga tushsa, eng yuqori qator olib tashlanadi (Monkeytype kabi)
const MAX_CURRENT_LINE = 1;
// Oxirgi tugmadan shuncha vaqt o'tsa, vaqt WPM hisobiga qo'shilmaydi
const IDLE_GAP_MS = 3000;
// Rekord shuncha to'g'ri so'zdan keyin hisobga olinadi (boshidagi tasodifiy yuqori WPM bo'lmasligi uchun)
const MIN_WORDS_FOR_BEST = 10;
const ID = 'typing';

module.exports = function createTyping(app) {
  const g = {
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

  function pickWord(prev) {
    const list = LEVELS[g.level].words;
    let word;
    do {
      word = list[Math.floor(Math.random() * list.length)];
    } while (word === prev && list.length > 1);
    return word;
  }

  function topUp() {
    while (g.words.length - g.pos < LOOKAHEAD) g.words.push(pickWord(g.words[g.words.length - 1]));
  }

  function wpm() {
    if (g.activeMs < 3000) return 0;
    return Math.round(g.correctChars / 5 / (g.activeMs / 60000));
  }

  function levelUp() {
    g.levelWords = 0;
    if (g.level < LEVELS.length - 1) {
      g.level++;
      g.words.length = g.pos;
      topUp();
      app.toast(app.T.levelUp(g.level + 1, app.T.levels[g.level]));
    } else {
      app.toast(app.T.lastLevel);
    }
  }

  function submitWord() {
    const word = g.words[g.pos];
    const ok = g.typed === word;
    g.results[g.pos] = { typed: g.typed, ok };
    g.pos++;
    g.typed = '';
    if (ok) {
      g.correctChars += word.length + 1;
      g.streak++;
      g.levelWords++;
      g.totalWords++;
      if (g.levelWords >= WORDS_PER_LEVEL) levelUp();
    } else {
      g.streak = 0;
    }
    topUp();
    if (g.totalWords >= MIN_WORDS_FOR_BEST) app.saveBest(ID, wpm());
  }

  // Bo'sh so'zda Backspace bosilsa, oldingi xato so'zga qaytadi
  function backToPreviousWord() {
    const prev = g.results[g.pos - 1];
    if (!prev || prev.ok) return false;
    g.pos--;
    g.typed = prev.typed;
    g.results.length = g.pos;
    return true;
  }

  // So'zlarni kenglikka qarab qatorlarga bo'ladi: [[boshlanish, tugash), ...]
  function layoutLines(width) {
    const lines = [];
    let start = 0;
    let len = 0;
    for (let i = 0; i < g.words.length; i++) {
      const typed = i < g.pos ? g.results[i].typed : i === g.pos ? g.typed : '';
      const w = Math.max(g.words[i].length, typed.length) + 1;
      if (len + w > width && i > start) {
        lines.push([start, i]);
        start = i;
        len = 0;
      }
      len += w;
    }
    lines.push([start, g.words.length]);
    return lines;
  }

  // Joriy so'z 3-qatorga tushsa, eng yuqori qatorni olib tashlaydi
  function scrollLines(width) {
    for (;;) {
      const lines = layoutLines(width);
      const current = lines.findIndex(([a, b]) => g.pos >= a && g.pos < b);
      if (current <= MAX_CURRENT_LINE) return lines;
      const n = lines[0][1];
      g.words.splice(0, n);
      g.results.splice(0, n);
      g.pos -= n;
    }
  }

  function drawWord(s, x, y, i, C, caretOn) {
    const target = g.words[i];
    if (i > g.pos) {
      s.text(x, y, target, { fg: C.sub });
      return;
    }
    const isCurrent = i === g.pos;
    const typed = isCurrent ? g.typed : g.results[i].typed;
    const wrong = !isCurrent && !g.results[i].ok;
    const len = Math.max(target.length, typed.length);
    for (let j = 0; j < len; j++) {
      let fg;
      let ch;
      if (j >= typed.length) [fg, ch] = [C.sub, target[j]];
      else if (j >= target.length) [fg, ch] = [C.errorExtra, typed[j]];
      else [fg, ch] = [typed[j] === target[j] ? C.text : C.error, target[j]];
      const caret = isCurrent && caretOn && j === typed.length;
      s.put(x + j, y, ch, caret ? { fg: C.bg, bg: C.main } : { fg, ul: wrong });
    }
    // So'z oxirida turgan kursor keyingi bo'sh katakka chiziladi
    if (isCurrent && caretOn && typed.length >= len) s.put(x + len, y, ' ', { bg: C.main });
  }

  const typing = {
    id: ID,
    labelKey: 'typing',

    reset() {
      Object.assign(g, {
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
    },

    start() {
      g.lastTickAt = Date.now();
    },

    // Har 200 ms: faqat yozilayotgan vaqt WPM hisobiga qo'shiladi
    idle() {
      const now = Date.now();
      if (app.isPlaying(ID) && now - g.lastKeyAt < IDLE_GAP_MS) g.activeMs += now - g.lastTickAt;
      g.lastTickAt = now;
    },

    startsOn: (k) => k.name === 'char',

    key(k) {
      if (k.name === 'backspace') {
        if (!g.typed && !backToPreviousWord()) return false;
        g.typed = g.typed.slice(0, -1);
      } else if (k.name === 'ctrl' && k.ch === 'w') {
        // Ctrl+W: so'zni butunlay tozalash (terminallardagi odatiy tugma)
        if (!g.typed && !backToPreviousWord()) return false;
        g.typed = '';
      } else if (k.name === 'space') {
        if (g.typed) submitWord();
      } else if (k.name === 'char') {
        g.keys++;
        if (k.ch === g.words[g.pos][g.typed.length]) g.goodKeys++;
        g.typed += k.ch;
      } else {
        return false;
      }
      g.lastKeyAt = Date.now();
      return true;
    },

    draw(s, box, C) {
      const T = app.T;
      const width = box.w;
      const top = box.y + Math.max(0, Math.floor((box.h - 10) / 2));

      // Darajalar
      const full = LEVELS.map((_l, i) => `${i + 1} ${T.levels[i]}`);
      if (full.join('   ').length <= width) {
        let x = box.x + Math.floor((width - full.join('   ').length) / 2);
        full.forEach((label, i) => {
          x += s.text(x, top, label, { fg: i === g.level ? C.main : C.sub, bold: i === g.level }) + 3;
        });
      } else {
        s.text(box.x, top, `${T.stats.level} ${g.level + 1}/${LEVELS.length} · ${T.levels[g.level]}`, { fg: C.main });
      }

      // Progress va jonli WPM
      const current = wpm();
      const progress = `${g.levelWords}/${WORDS_PER_LEVEL}`;
      s.text(box.x, top + 2, progress, { fg: C.main, bold: true });
      if (app.isPlaying(ID) && current) s.text(box.x + progress.length + 3, top + 2, String(current), { fg: C.sub });

      // Poyga yo'lagi
      const filled = Math.round((g.levelWords / WORDS_PER_LEVEL) * (width - 1));
      for (let x = 0; x < width; x++) s.put(box.x + x, top + 3, '━', { fg: x < filled ? C.main : C.alt });
      s.put(box.x + filled, top + 3, '▶', { fg: C.main });

      // So'zlar: 3 qator
      const lines = scrollLines(width);
      const caretOn = Date.now() - g.lastKeyAt < 1000 || Math.floor(Date.now() / 500) % 2 === 0;
      for (let row = 0; row < 3 && row < lines.length; row++) {
        const [a, b] = lines[row];
        let x = box.x;
        for (let i = a; i < b; i++) {
          drawWord(s, x, top + 5 + row, i, C, caretOn && app.isPlaying(ID));
          const typed = i < g.pos ? g.results[i].typed : i === g.pos ? g.typed : '';
          x += Math.max(g.words[i].length, typed.length) + 1;
        }
      }

      // Statistika
      const acc = (g.keys ? Math.round((g.goodKeys / g.keys) * 100) : 100) + '%';
      const stats = [
        [T.stats.wpm, current],
        [T.stats.acc, acc],
        [T.stats.streak, g.streak],
        [T.stats.best, app.best[ID] || 0],
      ];
      let x = box.x;
      for (const [label, value] of stats) {
        x += s.text(x, top + 9, `${label} `, { fg: C.sub });
        x += s.text(x, top + 9, String(value), { fg: C.main, bold: true }) + 4;
      }
    },

    startText: () => [app.T.start, app.T.startSub],
    hints: (T) => [
      ['tab', T.keys.restart],
      ['esc', T.keys.pause],
      ['enter', T.keys.resume],
    ],
  };
  return typing;
};
