// `zerikma open`: o'yinni Claude yonida ochadi. Qayerda ekaniga qarab:
//   VS Code ichidagi Claude  -> Zerikma extension paneli (o'rnatilmagan bo'lsa, VS Code o'rnatishni taklif qiladi)
//   tmux                     -> ekran ikkiga bo'linadi
//   Windows Terminal         -> yangi bo'lingan panel
//   boshqa hollarda          -> yangi terminal oynasi
const { spawn, spawnSync } = require('child_process');

const VSCODE_URI = 'vscode://MuhammadjonRahmatullayev.typing-race-for-claude-code/open';

function detached(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', ...opts });
  child.on('error', () => {});
  child.unref();
}

// Shell satri uchun xavfsiz qo'shtirnoq (tmux va osascript uchun)
const sh = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

function has(cmd) {
  const probe = process.platform === 'win32' ? spawnSync('where', [cmd]) : spawnSync('sh', ['-c', `command -v ${cmd}`]);
  return probe.status === 0;
}

function inVSCode(env) {
  return env.CLAUDE_CODE_ENTRYPOINT === 'claude-vscode' || env.TERM_PROGRAM === 'vscode';
}

function openUrl(url) {
  if (process.platform === 'win32') detached('cmd.exe', ['/c', 'start', '""', url], { windowsVerbatimArguments: true });
  else if (process.platform === 'darwin') detached('open', [url]);
  else detached('xdg-open', [url]);
}

function open({ script, passArgs = [], env = process.env }) {
  const node = process.execPath;
  const argv = [node, script, ...passArgs];

  if (inVSCode(env)) {
    openUrl(VSCODE_URI);
    return report('vscode');
  }

  if (env.TMUX) {
    // O'yin qulflanganda kursor Claude turgan panelga qaytishi uchun
    const withReturn = env.TMUX_PANE ? [...argv, '--return-pane', env.TMUX_PANE] : argv;
    const cmd = withReturn.map(sh).join(' ');
    const r = spawnSync('tmux', ['split-window', '-h', '-l', '45%', cmd]);
    // Eski tmux (< 3.1) foizli -l ni bilmaydi
    if (r.status !== 0) spawnSync('tmux', ['split-window', '-h', '-p', '45', cmd]);
    return report('tmux');
  }

  if (process.platform === 'win32') {
    if (env.WT_SESSION && has('wt.exe')) {
      // Yangi panel o'ngda ochiladi: qulf tushganda fokus chapdagi Claude'ga qaytadi
      detached('wt.exe', ['-w', '0', 'split-pane', '-V', '--size', '0.45', ...argv, '--return-wt']);
      return report('windows-terminal');
    }
    // "start" birinchi qo'shtirnoqli argumentni sarlavha deb oladi
    const quoted = argv.map((a) => `"${a}"`).join(' ');
    detached('cmd.exe', ['/c', `start "zerikma" ${quoted}`], { windowsVerbatimArguments: true });
    return report('new-window');
  }

  if (process.platform === 'darwin') {
    const cmd = argv.map(sh).join(' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const app = env.TERM_PROGRAM === 'iTerm.app' ? 'iTerm' : 'Terminal';
    const script =
      app === 'iTerm'
        ? `tell application "iTerm" to create window with default profile command "${cmd}"`
        : `tell application "Terminal" to do script "${cmd}"`;
    detached('osascript', ['-e', script, '-e', `tell application "${app}" to activate`]);
    return report('new-window');
  }

  // Linux: birinchi topilgan terminal emulyatori
  const terminals = [
    ['x-terminal-emulator', ['-e', ...argv]],
    ['gnome-terminal', ['--', ...argv]],
    ['konsole', ['-e', ...argv]],
    ['xfce4-terminal', ['-x', ...argv]],
    ['kitty', argv],
    ['alacritty', ['-e', ...argv]],
    ['wezterm', ['start', '--', ...argv]],
    ['xterm', ['-e', ...argv]],
  ];
  for (const [cmd, args] of terminals) {
    if (has(cmd)) {
      detached(cmd, args);
      return report('new-window');
    }
  }
  console.log('zerikma: no terminal emulator found. Open a new terminal and run: npx zerikma');
  return 'none';
}

function report(where) {
  const messages = {
    vscode: 'zerikma: opening the games panel in VS Code',
    tmux: 'zerikma: opened in a tmux split',
    'windows-terminal': 'zerikma: opened in a Windows Terminal pane',
    'new-window': 'zerikma: opened in a new terminal window',
  };
  console.log(messages[where]);
  return where;
}

module.exports = { open, inVSCode, openUrl };
