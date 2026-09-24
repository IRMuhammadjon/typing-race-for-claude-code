// Bug Smash (terminal): breakout. G'ishtlar bu buglar, bonuslar Claude tool'lari.
// Koordinatalar katakda; terminal katagi taxminan 2 barobar baland bo'lgani uchun vertikal tezlik yarmiga kamaytiriladi.
const ID = 'breakout';
const START_LIVES = 3;
const MAX_LIVES = 5;
const MAX_BALLS = 6;
const DROP_CHANCE = 0.14;
// Koptok platformaga tekkanda qaytish burchagi chegarasi (radian, vertikaldan)
const MAX_BOUNCE = 1.05;
// Terminal katagining eni/bo'yi nisbati: vertikal harakat shunga ko'ra sekinlashtiriladi
const ASPECT = 0.5;
// Terminal keyup yubormaydi: tugma bosilgandan keyin platforma shuncha vaqt yuradi (takrorlanish uni uzaytiradi)
const HOLD_MS = 170;

const BONUSES = {
  wide: { label: 'Grep', good: true, weight: 3 },
  multi: { label: 'Bash', good: true, weight: 3 },
  slow: { label: 'Read', good: true, weight: 2 },
  net: { label: 'Plan', good: true, weight: 2 },
  pierce: { label: 'Ultrathink', good: true, weight: 1.5 },
  life: { label: '+1', good: true, weight: 1 },
  shrink: { label: 'Rate limit', good: false, weight: 2 },
};
const DURATION = { wide: 12, slow: 8, pierce: 6, shrink: 8 };
const BUG_WORDS = ['bug', 'null', 'TODO', 'any', 'NaN', '404', 'leak', 'race', 'hack', 'undefined', 'flaky', 'typo'];
const ROW_COLORS = ['#ca4754', '#d9775a', '#e2b714', '#8fbf7f', '#7fa8bf', '#a58fbf'];

const LEFT = (k) => k.name === 'left' || (k.name === 'char' && 'aA'.includes(k.ch));
const RIGHT = (k) => k.name === 'right' || (k.name === 'char' && 'dD'.includes(k.ch));

module.exports = function createBreakout(app) {
  let W = 80; // maydon o'lchami (kataklarda), draw() da yangilanadi
  let H = 18;

  const s = {
    paddleX: 40,
    balls: [],
    stuck: true,
    bricks: [],
    drops: [],
    particles: [],
    effects: { wide: 0, slow: 0, pierce: 0, shrink: 0 },
    net: false,
    lives: START_LIVES,
    score: 0,
    level: 1,
    move: 0,
    moveUntil: 0,
    mouseX: null,
  };

  // ---------- O'lchamlar ----------

  const paddleW = () => Math.max(6, Math.round(W * 0.16 * (s.effects.wide > 0 ? 1.5 : 1) * (s.effects.shrink > 0 ? 0.6 : 1)));
  const paddleY = () => H - 2;
  const ballSpeed = () => W * 0.55 * (1 + 0.07 * (s.level - 1)) * (s.effects.slow > 0 ? 0.6 : 1);

  function layout() {
    const cols = W >= 70 ? 10 : W >= 50 ? 8 : 6;
    const bw = Math.floor((W - (cols - 1)) / cols);
    const pad = Math.floor((W - (cols * bw + cols - 1)) / 2);
    return { cols, bw, pad };
  }

  const brickRect = (b, L) => ({ x: L.pad + b.col * (L.bw + 1), y: 1 + b.row, w: L.bw });

  // ---------- Daraja ----------

  function buildLevel() {
    const L = layout();
    const rows = Math.max(3, Math.min(4 + s.level, 7, H - 9));
    const pattern = (s.level - 1) % 4;
    s.bricks = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < L.cols; col++) {
        // Har xil shakllar: to'liq, shaxmat, piramida, ramka
        if (pattern === 1 && (row + col) % 2 === 1 && row > 0) continue;
        if (pattern === 2 && (col < row / 2 || col >= L.cols - row / 2)) continue;
        if (pattern === 3 && row > 1 && row < rows - 1 && col > 1 && col < L.cols - 2) continue;
        const tough = Math.random() < Math.min(0.08 + s.level * 0.05, 0.4);
        s.bricks.push({
          col,
          row,
          hp: tough ? 2 : 1,
          maxHp: tough ? 2 : 1,
          bug: Math.random() < 0.08,
          word: BUG_WORDS[Math.floor(Math.random() * BUG_WORDS.length)],
          alive: true,
        });
      }
    }
  }

  function resetBall() {
    s.balls = [{ x: s.paddleX, y: paddleY() - 1, dx: 0, dy: -1 }];
    s.stuck = true;
  }

  function launch() {
    if (!s.stuck) return;
    s.stuck = false;
    const angle = (Math.random() - 0.5) * 0.8;
    s.balls[0].dx = Math.sin(angle);
    s.balls[0].dy = -Math.cos(angle);
  }

  // ---------- Bonuslar va zarrachalar ----------

  function randomBonus() {
    const entries = Object.entries(BONUSES);
    let roll = Math.random() * entries.reduce((n, [, b]) => n + b.weight, 0);
    for (const [type, b] of entries) {
      roll -= b.weight;
      if (roll <= 0) return type;
    }
    return 'wide';
  }

  function applyBonus(type) {
    if (type === 'multi') {
      const extra = [];
      for (const ball of s.balls) {
        for (const turn of [-0.45, 0.45]) {
          if (s.balls.length + extra.length >= MAX_BALLS) break;
          const cos = Math.cos(turn);
          const sin = Math.sin(turn);
          extra.push({ x: ball.x, y: ball.y, dx: ball.dx * cos - ball.dy * sin, dy: ball.dx * sin + ball.dy * cos });
        }
      }
      s.balls.push(...extra);
    } else if (type === 'net') {
      s.net = true;
    } else if (type === 'life') {
      s.lives = Math.min(s.lives + 1, MAX_LIVES);
    } else {
      s.effects[type] = DURATION[type];
      if (type === 'wide') s.effects.shrink = 0;
      if (type === 'shrink') s.effects.wide = 0;
    }
    app.toast(`${BONUSES[type].label}: ${app.T.bonus[type]}`);
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 4 + Math.random() * 8;
      s.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * ASPECT, life: 0.3 + Math.random() * 0.25, color });
    }
  }

  // ---------- Fizika ----------

  function hitBrick(b, L) {
    b.hp--;
    const r = brickRect(b, L);
    if (b.hp > 0) {
      s.score += 5 * s.level;
      return;
    }
    b.alive = false;
    s.score += (b.maxHp > 1 ? 25 : 10) * s.level;
    burst(r.x + r.w / 2, r.y, ROW_COLORS[b.row % ROW_COLORS.length], 4);
    if (b.bug || Math.random() < DROP_CHANCE) s.drops.push({ type: randomBonus(), x: r.x + r.w / 2, y: r.y + 1 });
  }

  function brickAt(cx, cy, L) {
    for (const b of s.bricks) {
      if (!b.alive) continue;
      const r = brickRect(b, L);
      if (cy === r.y && cx >= r.x && cx < r.x + r.w) return b;
    }
    return null;
  }

  function stepBall(ball, dist, L) {
    const px = ball.x;
    const py = ball.y;
    ball.x += ball.dx * dist;
    ball.y += ball.dy * dist * ASPECT;

    if (ball.x < 0) {
      ball.x = 0;
      ball.dx = Math.abs(ball.dx);
    } else if (ball.x > W - 1) {
      ball.x = W - 1;
      ball.dx = -Math.abs(ball.dx);
    }
    if (ball.y < 0) {
      ball.y = 0;
      ball.dy = Math.abs(ball.dy);
    }

    // Platforma: tekkan joyga qarab burchak o'zgaradi
    const pw = paddleW();
    const top = paddleY();
    if (ball.dy > 0 && py < top && ball.y >= top && Math.abs(ball.x - s.paddleX) <= pw / 2 + 0.5) {
      const rel = Math.max(-1, Math.min(1, (ball.x - s.paddleX) / (pw / 2)));
      ball.dx = Math.sin(rel * MAX_BOUNCE);
      ball.dy = -Math.cos(rel * MAX_BOUNCE);
      ball.y = top - 0.01;
    }

    // Himoya to'ri: bir marta qutqaradi
    if (s.net && ball.dy > 0 && ball.y >= H - 1) {
      ball.dy = -Math.abs(ball.dy);
      ball.y = H - 1.01;
      s.net = false;
      burst(ball.x, H - 1, app.colors.done, 6);
    }

    // G'ishtlar
    const b = brickAt(Math.floor(ball.x), Math.floor(ball.y), L);
    if (!b) return;
    hitBrick(b, L);
    if (s.effects.pierce > 0) {
      // Ultrathink: koptok g'ishtni teshib o'tadi, "legacy" g'isht ham birdan sinadi
      if (b.alive) {
        b.hp = 1;
        hitBrick(b, L);
      }
      return;
    }
    // Oldingi katak shu qatorda bo'lsa, yon tomondan urilgan
    if (Math.floor(py) === Math.floor(ball.y)) ball.dx = -ball.dx;
    else ball.dy = -ball.dy;
    ball.x = px;
    ball.y = py;
  }

  function loseLife() {
    s.lives--;
    s.effects = { wide: 0, slow: 0, pierce: 0, shrink: 0 };
    s.drops = [];
    if (s.lives <= 0) {
      app.saveBest(ID, s.score);
      app.end(() => [app.T.bOver(s.score), app.T.playAgain]);
      return;
    }
    app.toast(app.T.bLifeLost);
    resetBall();
  }

  function nextLevel() {
    s.level++;
    s.score += 100 * s.level;
    s.drops = [];
    buildLevel();
    resetBall();
    app.saveBest(ID, s.score);
    app.toast(app.T.bLevel(s.level));
  }

  function tick(dt) {
    for (const k of Object.keys(s.effects)) s.effects[k] = Math.max(0, s.effects[k] - dt);
    const L = layout();

    // Platforma: klaviatura (bosib turilganda) yoki sichqoncha
    const pw = paddleW();
    if (Date.now() < s.moveUntil) {
      s.paddleX += s.move * W * 1.1 * dt;
      s.mouseX = null;
    } else if (s.mouseX !== null) {
      s.paddleX += (s.mouseX - s.paddleX) * Math.min(1, dt * 25);
    }
    s.paddleX = Math.max(pw / 2, Math.min(W - pw / 2, s.paddleX));

    if (s.stuck) {
      s.balls[0].x = s.paddleX;
      s.balls[0].y = paddleY() - 1;
    } else {
      const dist = ballSpeed() * dt;
      // Tez koptok g'ishtdan "sakrab o'tib" ketmasligi uchun kichik qadamlar
      const steps = Math.max(1, Math.ceil(dist / 0.4));
      for (const ball of s.balls) for (let i = 0; i < steps; i++) stepBall(ball, dist / steps, L);
      s.balls = s.balls.filter((b) => b.y <= H);
      if (!s.balls.length) loseLife();
    }

    const top = paddleY();
    for (const d of s.drops) {
      d.y += 5 * dt;
      if (Math.floor(d.y) === top && Math.abs(d.x - s.paddleX) <= pw / 2 + 2) {
        d.caught = true;
        applyBonus(d.type);
      }
    }
    s.drops = s.drops.filter((d) => !d.caught && d.y < H);

    for (const p of s.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    s.particles = s.particles.filter((p) => p.life > 0);

    if (app.state[ID] === 'playing' && !s.bricks.some((b) => b.alive)) nextLevel();
  }

  // ---------- Chizish ----------

  function draw(scr, box, C) {
    const T = app.T;
    // Maydon o'lchami o'zgarsa, narsalarni proporsional ko'chiramiz
    const newW = box.w;
    const newH = Math.max(12, box.h - 2);
    if (newW !== W || newH !== H) {
      const kx = newW / W;
      const ky = newH / H;
      s.paddleX *= kx;
      for (const o of [...s.balls, ...s.drops]) {
        o.x *= kx;
        o.y *= ky;
      }
      W = newW;
      H = newH;
    }
    const fx = box.x;
    const fy = box.y + 2;

    // HUD
    let x = box.x;
    const stat = (label, value, color = C.main) => {
      x += scr.text(x, box.y, `${label} `, { fg: C.sub });
      x += scr.text(x, box.y, String(value), { fg: color, bold: true }) + 4;
    };
    stat(T.stats.score, s.score);
    stat(T.stats.lives, '♥'.repeat(Math.max(0, s.lives)) || '·', C.error);
    stat(T.stats.level, s.level);
    stat(T.stats.best, app.best[ID] || 0);
    const active = Object.entries(s.effects)
      .filter(([, t]) => t > 0)
      .map(([k, t]) => `${BONUSES[k].label} ${Math.ceil(t)}s`);
    if (s.net) active.push(BONUSES.net.label);
    const eff = active.join('  ');
    scr.text(box.x + box.w - eff.length, box.y, eff, { fg: C.text });

    // Maydon foni
    scr.fill(fx, fy, W, H, C.alt);

    // G'ishtlar: har birida bug nomi
    const L = layout();
    for (const b of s.bricks) {
      if (!b.alive) continue;
      const r = brickRect(b, L);
      const color = b.hp < b.maxHp ? C.sub : ROW_COLORS[b.row % ROW_COLORS.length];
      scr.fill(fx + r.x, fy + r.y, r.w, 1, color);
      const label = b.bug ? '✱bug' : b.word;
      const text = label.length > r.w ? label.slice(0, r.w) : label;
      scr.text(fx + r.x + Math.floor((r.w - text.length) / 2), fy + r.y, text, {
        fg: C.bg,
        bg: color,
        bold: b.bug,
        // "Legacy" g'isht: tagiga chizilgan, 2 marta urish kerak
        ul: b.maxHp > 1 && b.hp === b.maxHp,
      });
    }

    // Himoya to'ri
    if (s.net) for (let i = 0; i < W; i++) scr.put(fx + i, fy + H - 1, '═', { fg: C.done, bg: C.alt });

    // Platforma
    const pw = paddleW();
    const pl = Math.round(s.paddleX - pw / 2);
    const pcolor = s.effects.shrink > 0 ? C.error : s.effects.wide > 0 ? C.done : C.main;
    scr.fill(fx + pl, fy + paddleY(), pw, 1, pcolor);
    const name = pw >= 8 ? 'claude' : 'cc';
    scr.text(fx + pl + Math.floor((pw - name.length) / 2), fy + paddleY(), name, { fg: C.bg, bg: pcolor, bold: true });

    // Bonuslar
    for (const d of s.drops) {
      const b = BONUSES[d.type];
      const label = ` ${b.label} `;
      scr.text(fx + Math.round(d.x - label.length / 2), fy + Math.floor(d.y), label, {
        fg: b.good ? C.done : C.error,
        bg: C.bg,
        bold: true,
      });
    }

    // Zarrachalar
    for (const p of s.particles) {
      const px = Math.round(p.x);
      const py = Math.floor(p.y);
      if (px >= 0 && px < W && py >= 0 && py < H) scr.put(fx + px, fy + py, '·', { fg: p.color, bg: C.alt });
    }

    // Koptoklar: to'q sariq uchqun
    for (const ball of s.balls) {
      const bx = Math.round(ball.x);
      const by = Math.floor(ball.y);
      if (by >= 0 && by < H) scr.put(fx + bx, fy + by, '●', { fg: s.effects.pierce > 0 ? '#ffb38a' : C.spark, bg: C.alt, bold: true });
    }
  }

  return {
    id: ID,
    labelKey: 'breakout',
    aliases: ['bug', 'bugsmash', 'breakout'],
    realtime: true,

    reset() {
      Object.assign(s, {
        paddleX: W / 2,
        drops: [],
        particles: [],
        effects: { wide: 0, slow: 0, pierce: 0, shrink: 0 },
        net: false,
        lives: START_LIVES,
        score: 0,
        level: 1,
        move: 0,
        moveUntil: 0,
        mouseX: null,
      });
      buildLevel();
      resetBall();
    },

    pause() {
      s.moveUntil = 0;
    },

    tick,
    draw,

    startsOn: (k) => LEFT(k) || RIGHT(k),

    key(k) {
      if (LEFT(k) || RIGHT(k)) {
        s.move = LEFT(k) ? -1 : 1;
        s.moveUntil = Date.now() + HOLD_MS;
      } else if (k.name === 'space' || k.name === 'up') {
        launch();
      } else {
        return false;
      }
      return true;
    },

    // Sichqoncha (qo'llab-quvvatlaydigan terminallarda): platforma kursorga ergashadi, bosish koptokni otadi
    mouse(k, box) {
      s.mouseX = k.x - box.x;
      if (k.button === 0 && !k.release) launch();
    },

    startText: () => [app.T.bStart, app.T.bStartSub],
    hints: (T) => [
      ['← →', T.keys.move],
      ['space', T.keys.launch],
      ['tab', T.keys.restart],
      ['esc', T.keys.pause],
    ],
  };
};
