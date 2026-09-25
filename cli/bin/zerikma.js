#!/usr/bin/env node
// zerikma: Claude Code ishlayotganda terminalda mini o'yinlar.
//   zerikma              o'yinni shu terminalda ochadi
//   zerikma open         o'yinni yangi panel/oynada ochadi (tmux, Windows Terminal, macOS, Linux)
//   zerikma --game 2048  kerakli o'yindan boshlaydi (typing | 2048 | bug)
//   zerikma --lang uz    til: en | uz | ru
const pkg = require('../package.json');

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
// "zerikma 2048" yoki "/zerikma bug": o'yin nomini bayroqsiz ham yozish mumkin
const VALUE_FLAGS = ['--lang', '--game', '--return-pane'];
const positional = args.filter((a, i) => !a.startsWith('-') && !VALUE_FLAGS.includes(args[i - 1]) && a !== 'open');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`zerikma ${pkg.version}: mini games while Claude Code works

Usage:
  zerikma              play in this terminal
  zerikma open         open the games in a new pane/window next to Claude
  zerikma [NAME]       start with: news | typing | 2048 | bug
  zerikma --lang LANG  en | uz | ru
  zerikma --gentle     only pause when Claude is done (default: lock until you reply)
  zerikma --offline    don't check GitHub for new tips

Keys: ctrl+n next game · tab restart · esc pause · ctrl+l language · ctrl+c quit`);
  process.exit(0);
}
if (args.includes('--version') || args.includes('-v')) {
  console.log(pkg.version);
  process.exit(0);
}

if (args[0] === 'open') {
  require('../src/launch').open({ script: __filename, passArgs: args.slice(1) });
  process.exit(0);
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('zerikma needs an interactive terminal. Try: zerikma open');
  process.exit(1);
}

const { createTerminal } = require('../src/term');
const { createApp } = require('../src/app');
const shared = require('../src/shared');
const { createWatcher } = shared('claude-watch');
const { loadNews } = shared('news');
const { openUrl } = require('../src/launch');

const { spawn } = require('child_process');

// O'yin qulflanganda kursorni Claude turgan panelga qaytaradi (`zerikma open` bu bayroqlarni o'zi qo'shadi)
function returnFocus() {
  const run = (cmd, argv) => {
    const child = spawn(cmd, argv, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
  };
  const pane = flag('return-pane');
  if (pane) run('tmux', ['select-pane', '-t', pane]);
  else if (args.includes('--return-wt')) run('wt.exe', ['-w', '0', 'move-focus', 'left']);
}

const term = createTerminal();
const app = createApp({
  term,
  gameFactories: [
    require('../src/games/news'),
    require('../src/games/typing'),
    require('../src/games/g2048'),
    require('../src/games/breakout'),
  ],
  lang: flag('lang'),
  game: flag('game') || positional[0],
  strict: !args.includes('--gentle'),
  returnFocus,
  openUrl,
});

let watcher = null;
let stopped = false;
function stop(code = 0) {
  if (stopped) return;
  stopped = true;
  if (watcher) watcher.close();
  term.stop();
  process.exit(code);
}
app.onQuit = () => stop(0);
process.on('SIGTERM', () => stop(0));
process.on('SIGHUP', () => stop(0));
process.on('uncaughtException', (e) => {
  term.stop();
  console.error(e);
  process.exit(1);
});

// Avval alternativ ekranga o'tamiz, keyin chizamiz: kuzatuvchi yaratilishi bilan birinchi holatni yuboradi
term.onKey(app.key);
term.onResize(app.render);
term.start();
term.title('zerikma');
watcher = createWatcher({
  onUpdate: app.onClaude,
  onFinished: app.onFinished,
  onWaiting: app.onWaiting,
});
app.render();
// Yangiliklar: ichidagi nusxa darhol, GitHub'dagi yangilangani kelishi bilan (--offline bo'lsa internetsiz)
loadNews({ online: !args.includes('--offline') }).then(app.setNews, () => {});
