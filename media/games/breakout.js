// Bug Smash: breakout o'yini. Koptok bu to'q sariq uchqun, g'ishtlar esa "bug"lar.
// Bonuslar Claude tool'lari ko'rinishida tushadi: Grep, Bash, Read, Plan, Ultrathink...
(function () {
  const App = window.App;
  const ID = 'breakout';
  const COLS = 10;
  const START_LIVES = 3;
  const MAX_LIVES = 5;
  const MAX_BALLS = 6;
  // G'isht singanda bonus tushish ehtimoli (🐛 g'ishtlardan doim tushadi)
  const DROP_CHANCE = 0.14;
  // Koptok platformaga tekkanda qaytish burchagi chegarasi (radian, vertikaldan)
  const MAX_BOUNCE = 1.05;
  const SPARK = '#e07a52';

  // Bonuslar: effekt davomiyligi soniyada
  const BONUSES = {
    wide: { icon: '🔍', label: 'Grep', good: true, weight: 3 },
    multi: { icon: '⚡', label: 'Bash', good: true, weight: 3 },
    slow: { icon: '📄', label: 'Read', good: true, weight: 2 },
    net: { icon: '🛡️', label: 'Plan', good: true, weight: 2 },
    pierce: { icon: '✨', label: 'Ultrathink', good: true, weight: 1.5 },
    life: { icon: '❤️', label: '+1', good: true, weight: 1 },
    shrink: { icon: '⏳', label: 'Rate limit', good: false, weight: 2 },
  };
  const DURATION = { wide: 12, slow: 8, pierce: 6, shrink: 8 };
  const BUG_WORDS = ['bug', 'null', 'TODO', 'any', 'NaN', '404', 'leak', 'race', 'hack', 'undefined', 'flaky', 'typo'];

  let ui;
  let ctx;
  let W = 800;
  let H = 480;
  let raf = null;
  let lastFrame = 0;
  let colors = {};
  let colorsAt = 0;

  const s = {
    paddleX: 0, // platforma markazi
    balls: [], // { x, y, dx, dy } dx/dy: birlik vektor
    stuck: true, // koptok platformada, otilishini kutyapti
    bricks: [], // { col, row, hp, maxHp, bug, word, alive, flash }
    drops: [], // { type, x, y }
    particles: [], // { x, y, vx, vy, life, color }
    effects: { wide: 0, slow: 0, pierce: 0, shrink: 0 },
    net: false,
    lives: START_LIVES,
    score: 0,
    level: 1,
    keys: { left: false, right: false },
    mouseX: null,
    spin: 0,
  };

  // ---------- O'lchamlar (hammasi canvas o'lchamiga nisbatan) ----------

  const paddleW = () => W * 0.15 * (s.effects.wide > 0 ? 1.5 : 1) * (s.effects.shrink > 0 ? 0.65 : 1);
  const paddleH = () => Math.max(8, H * 0.024);
  const paddleY = () => H - paddleH() - H * 0.05;
  const ballR = () => Math.max(5, W * 0.0095);
  const ballSpeed = () => W * 0.6 * (1 + 0.07 * (s.level - 1)) * (s.effects.slow > 0 ? 0.6 : 1);
  const netY = () => H - H * 0.018;
  const layout = () => {
    const pad = W * 0.03;
    const gap = Math.max(3, W * 0.006);
    const bw = (W - pad * 2 - gap * (COLS - 1)) / COLS;
    const bh = Math.max(14, H * 0.05);
    return { pad, gap, bw, bh, top: H * 0.1 };
  };
  const brickRect = (b, L = layout()) => ({
    x: L.pad + b.col * (L.bw + L.gap),
    y: L.top + b.row * (L.bh + L.gap),
    w: L.bw,
    h: L.bh,
  });

  function readColors() {
    const cs = getComputedStyle(document.body);
    const v = (name) => cs.getPropertyValue(name).trim();
    colors = {
      text: v('--text'), sub: v('--sub'), subAlt: v('--sub-alt'), main: v('--main'),
      error: v('--error'), done: v('--done'), warn: v('--warn'), bg: v('--bg'),
      font: cs.fontFamily,
    };
    colorsAt = performance.now();
  }

  // Qator ranglari: serika palitrasiga mos, yumshoq
  const ROW_COLORS = ['#ca4754', '#d9775a', '#e2b714', '#8fbf7f', '#7fa8bf', '#a58fbf'];

  // ---------- Daraja ----------

  function buildLevel() {
    const rows = Math.min(4 + s.level, 8);
    const pattern = (s.level - 1) % 4;
    s.bricks = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < COLS; col++) {
        // Har xil shakllar: to'liq, shaxmat, piramida, ramka
        if (pattern === 1 && (row + col) % 2 === 1 && row > 0) continue;
        if (pattern === 2 && (col < row / 2 || col >= COLS - row / 2)) continue;
        if (pattern === 3 && row > 1 && row < rows - 1 && col > 1 && col < COLS - 2) continue;
        const tough = Math.random() < Math.min(0.08 + s.level * 0.05, 0.4);
        const bug = Math.random() < 0.08;
        s.bricks.push({
          col,
          row,
          hp: tough ? 2 : 1,
          maxHp: tough ? 2 : 1,
          bug,
          word: BUG_WORDS[Math.floor(Math.random() * BUG_WORDS.length)],
          alive: true,
          flash: 0,
        });
      }
    }
  }

  function resetBall() {
    s.balls = [{ x: s.paddleX, y: paddleY() - ballR(), dx: 0, dy: -1 }];
    s.stuck = true;
  }

  function reset() {
    Object.assign(s, {
      paddleX: W / 2,
      drops: [],
      particles: [],
      effects: { wide: 0, slow: 0, pierce: 0, shrink: 0 },
      net: false,
      lives: START_LIVES,
      score: 0,
      level: 1,
    });
    buildLevel();
    resetBall();
    renderHud();
    draw();
  }

  function launch() {
    if (!s.stuck) return;
    s.stuck = false;
    const angle = (Math.random() - 0.5) * 0.8;
    s.balls[0].dx = Math.sin(angle);
    s.balls[0].dy = -Math.cos(angle);
  }

  // ---------- Bonuslar ----------

  function randomBonus() {
    const entries = Object.entries(BONUSES);
    const total = entries.reduce((sum, [, b]) => sum + b.weight, 0);
    let roll = Math.random() * total;
    for (const [type, b] of entries) {
      roll -= b.weight;
      if (roll <= 0) return type;
    }
    return 'wide';
  }

  function applyBonus(type) {
    const b = BONUSES[type];
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
      // Qarama-qarshi effektlar bir-birini bekor qiladi
      if (type === 'wide') s.effects.shrink = 0;
      if (type === 'shrink') s.effects.wide = 0;
    }
    App.toast(`${b.icon} ${b.label}: ${App.T.bonus[type]}`);
    burst(s.paddleX, paddleY(), b.good ? colors.done : colors.error, 14);
    renderHud();
  }

  // ---------- Zarrachalar ----------

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.05 + Math.random() * 0.15) * W;
      s.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.3, color });
    }
  }

  // ---------- Fizika ----------

  function hitBrick(b) {
    b.hp--;
    b.flash = 0.15;
    const r = brickRect(b);
    if (b.hp > 0) {
      s.score += 5 * s.level;
      burst(r.x + r.w / 2, r.y + r.h / 2, colors.sub, 5);
      return;
    }
    b.alive = false;
    s.score += (b.maxHp > 1 ? 25 : 10) * s.level;
    burst(r.x + r.w / 2, r.y + r.h / 2, ROW_COLORS[b.row % ROW_COLORS.length], 8);
    if (b.bug || Math.random() < DROP_CHANCE) s.drops.push({ type: randomBonus(), x: r.x + r.w / 2, y: r.y + r.h / 2 });
  }

  function stepBall(ball, dist) {
    const r = ballR();
    const px = ball.x;
    const py = ball.y;
    ball.x += ball.dx * dist;
    ball.y += ball.dy * dist;

    // Devorlar
    if (ball.x < r) {
      ball.x = r;
      ball.dx = Math.abs(ball.dx);
    } else if (ball.x > W - r) {
      ball.x = W - r;
      ball.dx = -Math.abs(ball.dx);
    }
    if (ball.y < r) {
      ball.y = r;
      ball.dy = Math.abs(ball.dy);
    }

    // Platforma: tekkan joyga qarab burchak o'zgaradi
    const pw = paddleW();
    const top = paddleY();
    if (ball.dy > 0 && ball.y + r >= top && py + r <= top + paddleH() && Math.abs(ball.x - s.paddleX) <= pw / 2 + r) {
      const rel = Math.max(-1, Math.min(1, (ball.x - s.paddleX) / (pw / 2)));
      const angle = rel * MAX_BOUNCE;
      ball.dx = Math.sin(angle);
      ball.dy = -Math.cos(angle);
      ball.y = top - r;
    }

    // Himoya to'ri: bir marta qutqaradi
    if (s.net && ball.dy > 0 && ball.y + r >= netY()) {
      ball.dy = -Math.abs(ball.dy);
      ball.y = netY() - r;
      s.net = false;
      burst(ball.x, netY(), colors.done, 16);
    }

    // G'ishtlar
    const L = layout();
    for (const b of s.bricks) {
      if (!b.alive) continue;
      const rect = brickRect(b, L);
      const nx = Math.max(rect.x, Math.min(ball.x, rect.x + rect.w));
      const ny = Math.max(rect.y, Math.min(ball.y, rect.y + rect.h));
      if ((ball.x - nx) ** 2 + (ball.y - ny) ** 2 > r * r) continue;
      hitBrick(b);
      if (s.effects.pierce > 0) {
        // Ultrathink: koptok g'ishtni teshib o'tadi, "legacy" g'isht ham birdan sinadi
        if (b.alive) {
          b.hp = 1;
          hitBrick(b);
        }
        continue;
      }
      // Oldingi holatga qarab qaysi tomondan urilganini aniqlaymiz
      const wasOutsideX = px < rect.x || px > rect.x + rect.w;
      if (wasOutsideX) ball.dx = -ball.dx;
      else ball.dy = -ball.dy;
      ball.x = px;
      ball.y = py;
      break;
    }
  }

  function update(dt) {
    s.spin += dt * 7;
    for (const k of Object.keys(s.effects)) s.effects[k] = Math.max(0, s.effects[k] - dt);

    // Platforma: klaviatura yoki sichqoncha
    const pw = paddleW();
    if (s.keys.left || s.keys.right) {
      s.mouseX = null;
      s.paddleX += (s.keys.right - s.keys.left) * W * 1.15 * dt;
    } else if (s.mouseX !== null) {
      s.paddleX += (s.mouseX - s.paddleX) * Math.min(1, dt * 25);
    }
    s.paddleX = Math.max(pw / 2, Math.min(W - pw / 2, s.paddleX));

    if (s.stuck) {
      s.balls[0].x = s.paddleX;
      s.balls[0].y = paddleY() - ballR();
    } else {
      const dist = ballSpeed() * dt;
      // Tez koptok g'ishtlardan "sakrab o'tib" ketmasligi uchun kichik qadamlar
      const steps = Math.max(1, Math.ceil(dist / (ballR() * 0.7)));
      for (const ball of s.balls) for (let i = 0; i < steps; i++) stepBall(ball, dist / steps);
      s.balls = s.balls.filter((b) => b.y - ballR() <= H);
      if (!s.balls.length) loseLife();
    }

    // Tushayotgan bonuslar
    const top = paddleY();
    for (const d of s.drops) {
      d.y += H * 0.32 * dt;
      if (d.y >= top - 10 && d.y <= top + paddleH() + 10 && Math.abs(d.x - s.paddleX) <= pw / 2 + 12) {
        d.caught = true;
        applyBonus(d.type);
      }
    }
    s.drops = s.drops.filter((d) => !d.caught && d.y < H + 20);

    for (const p of s.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += H * 0.9 * dt;
      p.life -= dt;
    }
    s.particles = s.particles.filter((p) => p.life > 0);
    for (const b of s.bricks) b.flash = Math.max(0, b.flash - dt);

    if (!s.bricks.some((b) => b.alive)) nextLevel();
    renderHud();
  }

  function loseLife() {
    s.lives--;
    s.effects = { wide: 0, slow: 0, pierce: 0, shrink: 0 };
    s.drops = [];
    if (s.lives <= 0) {
      App.saveBest(ID, s.score);
      renderHud();
      App.end(() => [App.T.bOver(s.score), App.T.playAgain]);
      return;
    }
    App.toast(App.T.bLifeLost);
    resetBall();
  }

  function nextLevel() {
    s.level++;
    s.score += 100 * s.level;
    s.drops = [];
    buildLevel();
    resetBall();
    App.saveBest(ID, s.score);
    App.toast(App.T.bLevel(s.level));
  }

  // ---------- Chizish ----------

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function drawSpark(x, y, r, glow) {
    // Aylanuvchi uchqun: markaziy doira + 8 ta nur
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = SPARK;
    ctx.shadowBlur = glow ? r * 4 : r * 1.5;
    ctx.fillStyle = SPARK;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(s.spin);
    ctx.strokeStyle = SPARK;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.5, r * 0.32);
    for (let i = 0; i < 8; i++) {
      const len = i % 2 ? r * 1.35 : r * 1.8;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos((i * Math.PI) / 4) * len, Math.sin((i * Math.PI) / 4) * len);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    if (!ctx) return;
    if (performance.now() - colorsAt > 500) readColors();
    ctx.clearRect(0, 0, W, H);
    const L = layout();
    const fontSize = Math.max(9, L.bh * 0.42);

    // G'ishtlar
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const b of s.bricks) {
      if (!b.alive) continue;
      const r = brickRect(b, L);
      const color = ROW_COLORS[b.row % ROW_COLORS.length];
      ctx.globalAlpha = b.hp < b.maxHp ? 0.45 : 0.85;
      ctx.fillStyle = b.flash > 0 ? colors.text : color;
      roundRect(r.x, r.y, r.w, r.h, 4);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (b.maxHp > 1) {
        // "Legacy" g'isht: ramka bilan, 2 marta urish kerak
        ctx.strokeStyle = colors.text;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        roundRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, 3);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = colors.bg;
      ctx.font = `${fontSize}px ${colors.font}`;
      ctx.fillText(b.bug ? '🐛' : b.word, r.x + r.w / 2, r.y + r.h / 2 + 1, r.w - 6);
    }

    // Himoya to'ri
    if (s.net) {
      ctx.strokeStyle = colors.done;
      ctx.lineWidth = 3;
      ctx.shadowColor = colors.done;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(0, netY());
      ctx.lineTo(W, netY());
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Platforma
    const pw = paddleW();
    const ph = paddleH();
    const py = paddleY();
    ctx.fillStyle = s.effects.shrink > 0 ? colors.error : s.effects.wide > 0 ? colors.done : colors.main;
    roundRect(s.paddleX - pw / 2, py, pw, ph, ph / 2);
    ctx.fill();
    ctx.fillStyle = colors.bg;
    ctx.font = `bold ${Math.max(8, ph * 0.72)}px ${colors.font}`;
    ctx.fillText('claude', s.paddleX, py + ph / 2 + 1);

    // Bonus kapsulalari
    ctx.font = `${Math.max(10, H * 0.028)}px ${colors.font}`;
    for (const d of s.drops) {
      const b = BONUSES[d.type];
      const text = `${b.icon} ${b.label}`;
      const tw = ctx.measureText(text).width + 16;
      const th = Math.max(18, H * 0.05);
      ctx.fillStyle = colors.subAlt;
      ctx.strokeStyle = b.good ? colors.done : colors.error;
      ctx.lineWidth = 1.5;
      roundRect(d.x - tw / 2, d.y - th / 2, tw, th, th / 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = colors.text;
      ctx.fillText(text, d.x, d.y + 1);
    }

    // Zarrachalar
    for (const p of s.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    // Koptoklar
    for (const ball of s.balls) drawSpark(ball.x, ball.y, ballR(), s.effects.pierce > 0);
  }

  function renderHud() {
    ui.score.textContent = s.score;
    ui.lives.textContent = '♥'.repeat(Math.max(0, s.lives)) || '·';
    ui.level.textContent = s.level;
    ui.best.textContent = App.best[ID] || 0;
    const active = Object.entries(s.effects)
      .filter(([, t]) => t > 0)
      .map(([k, t]) => `${BONUSES[k].icon} ${Math.ceil(t)}s`);
    if (s.net) active.push(BONUSES.net.icon);
    ui.effects.textContent = active.join('  ');
  }

  // ---------- Sikl ----------

  function frame(now) {
    const dt = Math.min(0.033, (now - lastFrame) / 1000);
    lastFrame = now;
    update(dt);
    draw();
    if (App.isPlaying(ID)) raf = requestAnimationFrame(frame);
    else raf = null;
  }

  function startLoop() {
    if (raf) return;
    lastFrame = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    // Pauza paytida keyup kelmay qolishi mumkin: platforma o'zicha yurib ketmasin
    s.keys = { left: false, right: false };
    draw();
  }

  function resize() {
    if (App.active !== ID) return;
    const oldW = W;
    const oldH = H;
    W = Math.max(280, ui.wrap.clientWidth);
    H = Math.round(Math.min(W * 0.62, Math.max(260, window.innerHeight * 0.5)));
    const dpr = window.devicePixelRatio || 1;
    ui.canvas.width = Math.round(W * dpr);
    ui.canvas.height = Math.round(H * dpr);
    ui.canvas.style.height = `${H}px`;
    ctx = ui.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // O'lcham o'zgarsa, harakatlanuvchi narsalarni proporsional ko'chiramiz
    const kx = W / oldW;
    const ky = H / oldH;
    s.paddleX *= kx;
    for (const o of [...s.balls, ...s.drops, ...s.particles]) {
      o.x *= kx;
      o.y *= ky;
    }
    readColors();
    draw();
  }

  function mount(root) {
    root.innerHTML = `
      <div class="g-hud">
        <div class="stat"><span class="label" data-i18n="stats.score"></span><span class="value" data-ref="score">0</span></div>
        <div class="stat"><span class="label" data-i18n="stats.lives"></span><span class="value lives" data-ref="lives"></span></div>
        <div class="stat"><span class="label" data-i18n="stats.level"></span><span class="value" data-ref="level">1</span></div>
        <div class="stat"><span class="label" data-i18n="stats.best"></span><span class="value" data-ref="best">0</span></div>
        <div class="effects" data-ref="effects"></div>
      </div>
      <div class="canvas-wrap" data-ref="wrap"><canvas data-ref="canvas"></canvas></div>`;
    ui = App.refs(root);
    ctx = ui.canvas.getContext('2d');

    ui.canvas.addEventListener('pointermove', (e) => {
      s.mouseX = e.offsetX;
    });
    ui.canvas.addEventListener('pointerdown', () => {
      if (App.isPlaying(ID)) launch();
    });

    reset();
  }

  const LEFT = ['ArrowLeft', 'a', 'A'];
  const RIGHT = ['ArrowRight', 'd', 'D'];

  App.register({
    id: ID,
    labelKey: 'breakout',
    icon: '✳',
    pauseOnBlur: true,
    mount,
    show: resize,
    resize,
    start: startLoop,
    pause: stopLoop,
    reset,
    keydown(e) {
      if (LEFT.includes(e.key)) s.keys.left = true;
      else if (RIGHT.includes(e.key)) s.keys.right = true;
      else if (e.key === ' ' || e.key === 'ArrowUp') launch();
      else return false;
      return true;
    },
    keyup(e) {
      if (LEFT.includes(e.key)) s.keys.left = false;
      if (RIGHT.includes(e.key)) s.keys.right = false;
    },
    startsOn: (e) => LEFT.includes(e.key) || RIGHT.includes(e.key),
    startText: () => [App.T.bStart, App.T.bStartSub],
    hints: () => [
      ['← →', App.T.keys.move],
      ['space', App.T.keys.launch],
      ['tab', App.T.keys.restart],
      ['esc', App.T.keys.pause],
      ['🖱', App.T.keys.mouse],
    ],
    refresh() {
      if (ui) renderHud();
    },
  });
})();
