const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Claude sessiyalarini kuzatish terminal versiya (npx zerikma) bilan umumiy
const { createWatcher, CLAUDE_DIR } = require('./shared/claude-watch');

const GAMES_DIR = path.join(CLAUDE_DIR, 'typing-race');
const HOOK_TARGET = path.join(GAMES_DIR, 'hook.js');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');
const HOOK_MARKER = 'typing-race';
const HOOK_EVENTS = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd'];
const TOOL_EVENTS = ['PreToolUse', 'PostToolUse'];
const AUTHOR_URL = 'https://www.linkedin.com/in/muhammadjon-rahmatullayev-b9356a321/';
const LANGS = ['en', 'uz', 'ru'];
const GAMES = ['typing', 'g2048', 'breakout'];

// Extension tomonidagi matnlar (o'yin matnlari shared/i18n.js da)
const STRINGS = {
  en: {
    busy: 'Claude is working',
    busyTip: 'Play a mini game while you wait',
    waiting: 'Claude needs permission',
    waitingTip: 'Go back to the Claude panel',
    idleTip: 'Open Zerikma',
    hooksInstalled: 'Claude Code hooks installed. Restart running Claude sessions.',
    hooksRemoved: 'Zerikma hooks removed.',
    settingsReadError: (e) => `Could not read ~/.claude/settings.json: ${e}`,
    hooksRemoveError: (e) => `Could not remove hooks: ${e}`,
  },
  uz: {
    busy: 'Claude ishlayapti',
    busyTip: "Kutayotganda mini o'yin o'ynang",
    waiting: 'Claude ruxsat kutyapti',
    waitingTip: 'Claude paneliga qayting',
    idleTip: "Zerikma'ni ochish",
    hooksInstalled: "Claude Code hook'lari o'rnatildi. Ishlab turgan Claude sessiyalarini qayta ishga tushiring.",
    hooksRemoved: "Zerikma hook'lari o'chirildi.",
    settingsReadError: (e) => `~/.claude/settings.json o'qib bo'lmadi: ${e}`,
    hooksRemoveError: (e) => `Hook'larni o'chirib bo'lmadi: ${e}`,
  },
  ru: {
    busy: 'Claude работает',
    busyTip: 'Сыграйте в мини-игру, пока ждёте',
    waiting: 'Claude ждёт разрешения',
    waitingTip: 'Вернитесь в панель Claude',
    idleTip: 'Открыть Zerikma',
    hooksInstalled: 'Хуки Claude Code установлены. Перезапустите активные сессии Claude.',
    hooksRemoved: 'Хуки Zerikma удалены.',
    settingsReadError: (e) => `Не удалось прочитать ~/.claude/settings.json: ${e}`,
    hooksRemoveError: (e) => `Не удалось удалить хуки: ${e}`,
  },
};

let extContext;

// Tanlangan til saqlanadi; bo'lmasa VS Code tiliga qaraladi
function currentLang() {
  const saved = extContext && extContext.globalState.get('lang');
  if (LANGS.includes(saved)) return saved;
  const ui = vscode.env.language.toLowerCase();
  if (ui.startsWith('ru')) return 'ru';
  if (ui.startsWith('uz')) return 'uz';
  return 'en';
}

const t = () => STRINGS[currentLang()];

let panel;
let statusItem;
let watcher;
let lastStatus = 'idle';
let busySince = 0;
let lastPayload = { type: 'claude', status: 'idle', tool: '', sessions: [] };

function activate(context) {
  extContext = context;

  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.command = 'typingRace.open';
  context.subscriptions.push(
    statusItem,
    vscode.commands.registerCommand('typingRace.open', () => openPanel(context, false)),
    vscode.commands.registerCommand('typingRace.installHooks', () => installHooks(context)),
    vscode.commands.registerCommand('typingRace.uninstallHooks', uninstallHooks),
    // /zerikma (Claude Code plugin) VS Code ichida shu manzil orqali panelni ochadi
    vscode.window.registerUriHandler({
      handleUri: (uri) => {
        if (uri.path === '/open') openPanel(context, false);
      },
    })
  );

  watcher = createWatcher({
    onUpdate: (state) => {
      const prevStatus = lastStatus;
      lastStatus = state.status;
      if (state.status === 'busy' && prevStatus === 'idle') {
        busySince = Date.now();
        if (vscode.workspace.getConfiguration('typingRace').get('autoOpen')) openPanel(context, true);
      }
      if (state.status === 'idle') busySince = 0;
      lastPayload = { type: 'claude', ...state };
      post(lastPayload);
      updateStatusBar();
    },
    onFinished: (s) => post({ type: 'finished', title: s.title, project: s.project }),
    onWaiting: (s) => post({ type: 'waiting', title: s.title, project: s.project }),
  });

  const clock = setInterval(updateStatusBar, 1000);
  context.subscriptions.push({
    dispose: () => {
      watcher.close();
      clearInterval(clock);
    },
  });

  updateStatusBar();
  statusItem.show();
}

function busyCount() {
  return lastPayload.sessions.filter((s) => s.status === 'busy').length;
}

function updateStatusBar() {
  if (!statusItem) return;
  if (lastStatus === 'busy') {
    const sec = Math.floor((Date.now() - busySince) / 1000);
    const time = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    const count = busyCount();
    statusItem.text = `$(loading~spin) ${t().busy}${count > 1 ? ` (${count})` : ''} ${time}`;
    statusItem.tooltip = t().busyTip;
  } else if (lastStatus === 'waiting') {
    statusItem.text = `$(bell) ${t().waiting}`;
    statusItem.tooltip = t().waitingTip;
  } else {
    statusItem.text = '$(smiley) Zerikma';
    statusItem.tooltip = t().idleTip;
  }
}

function post(message) {
  if (panel) panel.webview.postMessage(message);
}

function openPanel(context, preserveFocus) {
  if (panel) {
    panel.reveal(undefined, preserveFocus);
    return;
  }
  const root = context.extensionUri;
  const roots = ['media', 'shared'].map((dir) => vscode.Uri.joinPath(root, dir));
  panel = vscode.window.createWebviewPanel(
    'typingRace.game',
    '🎮 Zerikma',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus },
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: roots }
  );
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.png');
  panel.webview.html = getHtml(panel.webview, root, currentLang());
  panel.webview.onDidReceiveMessage((m) => {
    if (m.type === 'ready') {
      post({ type: 'init', best: readBests(context), game: context.globalState.get('game') });
      post(lastPayload);
    } else if (m.type === 'best' && GAMES.includes(m.game)) {
      context.globalState.update('bests', { ...readBests(context), [m.game]: m.value });
    } else if (m.type === 'game' && GAMES.includes(m.value)) {
      context.globalState.update('game', m.value);
    } else if (m.type === 'lang' && LANGS.includes(m.value)) {
      context.globalState.update('lang', m.value).then(updateStatusBar);
    } else if (m.type === 'openAuthor') {
      vscode.env.openExternal(vscode.Uri.parse(AUTHOR_URL));
    }
  });
  panel.onDidDispose(() => (panel = undefined));
}

// Har bir o'yinning rekordi; 0.4 dagi bitta "bestWpm" typing rekordi sifatida olinadi
function readBests(context) {
  const bests = context.globalState.get('bests', {});
  if (bests.typing === undefined) bests.typing = context.globalState.get('bestWpm', 0);
  return bests;
}

function getHtml(webview, root, lang) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const uri = (file) => webview.asWebviewUri(vscode.Uri.joinPath(root, file));
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${uri('media/style.css')}">
<title>Zerikma</title>
</head>
<body data-lang="${lang}">
  <header>
    <div class="logo"><span class="icon">✳</span>zerik<span class="sub">ma</span></div>
    <nav id="tabs" class="tabs"></nav>
    <div id="langs" class="langs">${LANGS.map((l) => `<button data-lang-option="${l}">${l}</button>`).join('')}</div>
  </header>
  <div id="claude-status" class="claude">
    <span class="dot"></span>
    <span class="claude-text"><span id="claude-title" class="claude-title"></span><span id="claude-sub" class="claude-sub"></span></span>
  </div>
  <div id="sessions" class="sessions"></div>
  <main id="stage" class="stage">
    <div id="overlay" class="overlay"><div id="overlay-title" class="title"></div><div id="overlay-text" class="text"></div></div>
  </main>
  <footer id="hints"></footer>
  <button id="author" class="author">by Muhammadjon Rahmatullayev <span class="in">in</span></button>
  <div id="toast" class="toast"></div>
${[
  'shared/i18n.js',
  'shared/words.js',
  'shared/banner.js',
  'media/shell.js',
  'media/games/typing.js',
  'media/games/g2048.js',
  'media/games/breakout.js',
  'media/boot.js',
]
  .map((f) => `  <script nonce="${nonce}" src="${uri(f)}"></script>`)
  .join('\n')}
</body>
</html>`;
}

// ---------- Hook'larni ~/.claude/settings.json ga o'rnatish ----------

function readSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) return {};
  return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
}

function writeSettings(settings) {
  if (fs.existsSync(SETTINGS_FILE)) fs.copyFileSync(SETTINGS_FILE, SETTINGS_FILE + '.bak-typing-race');
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n');
}

function removeOurHooks(hooks) {
  for (const event of Object.keys(hooks)) {
    if (!Array.isArray(hooks[event])) continue;
    hooks[event] = hooks[event].filter(
      (group) => !(group.hooks || []).some((h) => String(h.command || '').includes(HOOK_MARKER))
    );
    if (!hooks[event].length) delete hooks[event];
  }
}

async function installHooks(context) {
  let settings;
  try {
    settings = readSettings();
  } catch (e) {
    vscode.window.showErrorMessage(t().settingsReadError(e.message));
    return;
  }
  // Skript barqaror joyga ko'chiriladi: extension yangilanganda yo'l o'zgarmaydi
  fs.mkdirSync(GAMES_DIR, { recursive: true });
  fs.copyFileSync(path.join(context.extensionPath, 'hooks', 'typing-race-hook.js'), HOOK_TARGET);
  const command = `node "${HOOK_TARGET.replace(/\\/g, '/')}"`;

  settings.hooks = settings.hooks || {};
  removeOurHooks(settings.hooks);
  for (const event of HOOK_EVENTS) {
    const group = { hooks: [{ type: 'command', command, timeout: 5 }] };
    if (TOOL_EVENTS.includes(event)) group.matcher = '*';
    (settings.hooks[event] = settings.hooks[event] || []).push(group);
  }
  writeSettings(settings);
  vscode.window.showInformationMessage(t().hooksInstalled);
}

function uninstallHooks() {
  try {
    const settings = readSettings();
    if (settings.hooks) {
      removeOurHooks(settings.hooks);
      if (!Object.keys(settings.hooks).length) delete settings.hooks;
      writeSettings(settings);
    }
    fs.rmSync(HOOK_TARGET, { force: true });
    vscode.window.showInformationMessage(t().hooksRemoved);
  } catch (e) {
    vscode.window.showErrorMessage(t().hooksRemoveError(e.message));
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
