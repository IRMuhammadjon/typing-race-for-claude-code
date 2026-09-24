// Terminal qatlami: ekran buferi (har kadr bir yo'la chiziladi), klaviatura/sichqoncha tahlili,
// alternativ ekran va xom (raw) rejim. Tashqi kutubxonalarsiz.

const CSI = '\x1b[';

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}`;
}

// Ikki rangni aralashtiradi: t = 0 -> a, t = 1 -> b
function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

// Har bir katak: belgi + rang + qalinlik/tagiga chizish. Kadr oxirida bitta satrga aylantiriladi.
class Screen {
  constructor(w, h, bg) {
    this.w = w;
    this.h = h;
    this.cells = new Array(w * h);
    this.clear(bg);
  }

  clear(bg) {
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = { ch: ' ', fg: null, bg, bold: false, ul: false };
  }

  put(x, y, ch, style = {}) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const c = this.cells[y * this.w + x];
    c.ch = ch;
    if (style.fg !== undefined) c.fg = style.fg;
    if (style.bg !== undefined) c.bg = style.bg;
    c.bold = Boolean(style.bold);
    c.ul = Boolean(style.ul);
  }

  // Matn yozadi va uning uzunligini qaytaradi (har bir belgi bitta katak deb olinadi)
  text(x, y, str, style = {}) {
    let i = 0;
    for (const ch of String(str)) this.put(x + i++, y, ch, style);
    return i;
  }

  fill(x, y, w, h, bg) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.put(i, j, ' ', { bg });
  }

  // Overlay ostidagi o'yinni xiralashtiradi: matn kulrang, fon esa sahifa foniga yaqinlashadi
  dim(x, y, w, h, fg, bg) {
    for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) {
        const c = this.cells[j * this.w + i];
        c.fg = fg;
        if (c.bg && bg) c.bg = mix(c.bg, bg, 0.75);
        c.bold = false;
        c.ul = false;
      }
    }
  }

  // Butun kadrni ANSI satriga aylantiradi: faqat uslub o'zgarganda yangi SGR kodi yoziladi
  toAnsi() {
    let out = `${CSI}H`;
    for (let y = 0; y < this.h; y++) {
      out += `${CSI}${y + 1};1H`;
      let prev = '';
      for (let x = 0; x < this.w; x++) {
        const c = this.cells[y * this.w + x];
        let sgr = '0';
        if (c.bold) sgr += ';1';
        if (c.ul) sgr += ';4';
        if (c.fg) sgr += `;38;2;${rgb(c.fg)}`;
        if (c.bg) sgr += `;48;2;${rgb(c.bg)}`;
        if (sgr !== prev) {
          out += `${CSI}${sgr}m`;
          prev = sgr;
        }
        out += c.ch;
      }
    }
    return out + `${CSI}0m`;
  }

  // Test va skrinshotlar uchun: faqat matn
  toText() {
    const rows = [];
    for (let y = 0; y < this.h; y++) {
      let row = '';
      for (let x = 0; x < this.w; x++) row += this.cells[y * this.w + x].ch;
      rows.push(row.replace(/\s+$/, ''));
    }
    return rows.join('\n');
  }
}

const ARROWS = { A: 'up', B: 'down', C: 'right', D: 'left' };

// Terminaldan kelgan baytlarni tugma hodisalariga aylantiradi
function parseKeys(data) {
  const s = data.toString('utf8');
  const keys = [];
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    let m;
    // SGR sichqoncha: ESC [ < tugma ; x ; y M|m
    if ((m = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(rest))) {
      keys.push({ name: 'mouse', button: Number(m[1]), x: Number(m[2]) - 1, y: Number(m[3]) - 1, release: m[4] === 'm' });
      i += m[0].length;
      continue;
    }
    if ((m = /^\x1b\[(?:1;(\d+))?([ABCD])/.exec(rest)) || (m = /^\x1bO()([ABCD])/.exec(rest))) {
      keys.push({ name: ARROWS[m[2]], ctrl: m[1] === '5' });
      i += m[0].length;
      continue;
    }
    if (rest[0] === '\x1b') {
      // Boshqa CSI ketma-ketliklari (F-tugmalar, Delete...) e'tiborsiz qoldiriladi
      if ((m = /^\x1b\[[0-9;?]*[ -/]*[@-~]/.exec(rest))) {
        i += m[0].length;
        continue;
      }
      keys.push({ name: 'escape' });
      i += rest[1] && rest[1] !== '\x1b' ? 2 : 1; // Alt+tugma: ikkala belgi ham tashlanadi
      continue;
    }
    const ch = String.fromCodePoint(s.codePointAt(i));
    i += ch.length;
    const code = ch.codePointAt(0);
    if (ch === '\r' || ch === '\n') keys.push({ name: 'enter' });
    else if (ch === '\t') keys.push({ name: 'tab' });
    else if (ch === '\x7f' || ch === '\b') keys.push({ name: 'backspace' });
    else if (code < 32) keys.push({ name: 'ctrl', ch: String.fromCharCode(code + 96) }); // Ctrl+C -> 'c'
    else if (ch === ' ') keys.push({ name: 'space', ch });
    else keys.push({ name: 'char', ch });
  }
  return keys;
}

// Haqiqiy terminal: alternativ ekran, yashirin kursor, xom rejim. Chiqishda hammasi tiklanadi.
function createTerminal({ stdin = process.stdin, stdout = process.stdout } = {}) {
  let mouseOn = false;
  const listeners = { key: [], resize: [] };

  const term = {
    get cols() {
      return stdout.columns || 80;
    },
    get rows() {
      return stdout.rows || 24;
    },
    write: (s) => stdout.write(s),
    onKey: (cb) => listeners.key.push(cb),
    onResize: (cb) => listeners.resize.push(cb),
    bell: () => stdout.write('\x07'),
    title: (t) => stdout.write(`\x1b]0;${t}\x07`),
    mouse(on) {
      if (on === mouseOn) return;
      mouseOn = on;
      // 1003: har qanday harakat, 1006: SGR formatidagi koordinatalar
      stdout.write(on ? `${CSI}?1003h${CSI}?1006h` : `${CSI}?1003l${CSI}?1006l`);
    },
    start() {
      stdout.write(`${CSI}?1049h${CSI}?25l${CSI}2J`);
      if (stdin.isTTY) stdin.setRawMode(true);
      stdin.resume();
      stdin.on('data', (d) => {
        for (const k of parseKeys(d)) for (const cb of listeners.key) cb(k);
      });
      stdout.on('resize', () => {
        for (const cb of listeners.resize) cb();
      });
    },
    stop() {
      term.mouse(false);
      stdout.write(`${CSI}0m${CSI}?25h${CSI}?1049l`);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
    },
  };
  return term;
}

module.exports = { Screen, parseKeys, createTerminal };
