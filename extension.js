const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
// Claude Code har bir sessiyani shu yerga yozib boradi: <project>/<session_id>.jsonl
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
// Transcript faylining faqat oxiri o'qiladi: fayl bir necha MB bo'lishi mumkin
const TAIL_BYTES = 256 * 1024;
// Transcript shuncha vaqt o'zgarmasa, sessiya tashlab ketilgan deb hisoblanadi
const TRANSCRIPT_STALE_MS = 15 * 60 * 1000;
const GAMES_DIR = path.join(CLAUDE_DIR, 'typing-race');
const SESSIONS_DIR = path.join(GAMES_DIR, 'sessions');
const HOOK_TARGET = path.join(GAMES_DIR, 'hook.js');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');
const HOOK_MARKER = 'typing-race';
const HOOK_EVENTS = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd'];
const TOOL_EVENTS = ['PreToolUse', 'PostToolUse'];
const AUTHOR_URL = 'https://www.linkedin.com/in/muhammadjon-rahmatullayev-b9356a321/';
const LANGS = ['en', 'uz', 'ru'];

// Extension tomonidagi matnlar (o'yin matnlari media/i18n.js da)
const STRINGS = {
  en: {
    busy: 'Claude is working',
    busyTip: 'Play Typing Race while you wait',
    waiting: 'Claude needs permission',
    waitingTip: 'Go back to the Claude panel',
    idleTip: 'Open Typing Race',
    hooksInstalled: 'Claude Code hooks installed. Restart running Claude sessions.',
    hooksRemoved: 'Typing Race hooks removed.',
    settingsReadError: (e) => `Could not read ~/.claude/settings.json: ${e}`,
    hooksRemoveError: (e) => `Could not remove hooks: ${e}`,
  },
  uz: {
    busy: 'Claude ishlayapti',
    busyTip: "Kutayotganda Typing Race o'ynang",
    waiting: 'Claude ruxsat kutyapti',
    waitingTip: 'Claude paneliga qayting',
    idleTip: "Typing Race'ni ochish",
    hooksInstalled: "Claude Code hook'lari o'rnatildi. Ishlab turgan Claude sessiyalarini qayta ishga tushiring.",
    hooksRemoved: "Typing Race hook'lari o'chirildi.",
    settingsReadError: (e) => `~/.claude/settings.json o'qib bo'lmadi: ${e}`,
    hooksRemoveError: (e) => `Hook'larni o'chirib bo'lmadi: ${e}`,
  },
  ru: {
    busy: 'Claude работает',
    busyTip: 'Сыграйте в Typing Race, пока ждёте',
    waiting: 'Claude ждёт разрешения',
    waitingTip: 'Вернитесь в панель Claude',
    idleTip: 'Открыть Typing Race',
    hooksInstalled: 'Хуки Claude Code установлены. Перезапустите активные сессии Claude.',
    hooksRemoved: 'Хуки Typing Race удалены.',
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
let lastStatus = 'idle';
let lastTool = '';
let busySince = 0;
// transcript fayl yo'li -> { status, tool, ts }
const transcripts = new Map();

function activate(context) {
  extContext = context;
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });

  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.command = 'typingRace.open';
  context.subscriptions.push(
    statusItem,
    vscode.commands.registerCommand('typingRace.open', () => openPanel(context, false)),
    vscode.commands.registerCommand('typingRace.installHooks', () => installHooks(context)),
    vscode.commands.registerCommand('typingRace.uninstallHooks', uninstallHooks)
  );

  let debounce;
  const scheduleRefresh = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => refresh(context), 80);
  };

  // Hook'lar ixtiyoriy: ular faqat "ruxsat so'rayapti" holatini qo'shadi
  const hookWatcher = fs.watch(SESSIONS_DIR, scheduleRefresh);

  // Asosiy manba: Claude Code transcript fayllari, hech narsa o'rnatish shart emas
  const pending = new Map();
  const transcriptWatcher = fs.watch(PROJECTS_DIR, { recursive: true }, (_event, filename) => {
    if (!filename || !filename.endsWith('.jsonl')) return;
    // Faqat <project>/<session>.jsonl: subagent transcriptlari hisobga olinmaydi
    if (filename.split(/[\\/]/).length !== 2) return;
    const file = path.join(PROJECTS_DIR, filename);
    clearTimeout(pending.get(file));
    pending.set(file, setTimeout(() => {
      pending.delete(file);
      updateTranscript(file);
      scheduleRefresh();
    }, 100));
  });

  const clock = setInterval(updateStatusBar, 1000);
  // Eskirgan sessiyalarni vaqti-vaqti bilan tozalash uchun
  const staleCheck = setInterval(() => refresh(context), 30 * 1000);
  context.subscriptions.push({
    dispose: () => {
      hookWatcher.close();
      transcriptWatcher.close();
      clearInterval(clock);
      clearInterval(staleCheck);
    },
  });

  scanRecentTranscripts();
  refresh(context);
  updateStatusBar();
  statusItem.show();
}

function scanRecentTranscripts() {
  const now = Date.now();
  for (const project of fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    const dir = path.join(PROJECTS_DIR, project.name);
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.jsonl')) continue;
      const file = path.join(dir, name);
      try {
        if (now - fs.statSync(file).mtimeMs < TRANSCRIPT_STALE_MS) updateTranscript(file);
      } catch {
        // Fayl o'chirilgan bo'lishi mumkin
      }
    }
  }
}

function readTail(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    return buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function messageText(content) {
  if (typeof content === 'string') return content;
  return (content || [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('');
}

// Transcriptning oxirgi asosiy yozuviga qarab Claude ishlayaptimi yoki yo'qligini aniqlaydi
function transcriptStatus(text) {
  const lines = text.split('\n');
  let afterToolResult = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue; // bo'sh yoki kesilgan qator
    }
    if (entry.isSidechain || entry.isMeta || !entry.message) continue;
    const content = entry.message.content;

    if (entry.type === 'assistant') {
      const stop = entry.message.stop_reason;
      if (!afterToolResult && (stop === 'end_turn' || stop === 'stop_sequence')) return { status: 'idle', tool: '' };
      const toolUse = Array.isArray(content) && content.filter((c) => c.type === 'tool_use').pop();
      if (toolUse) return { status: 'busy', tool: toolUse.name };
      if (!afterToolResult) return { status: 'busy', tool: '' };
    } else if (entry.type === 'user') {
      if (Array.isArray(content) && content.some((c) => c.type === 'tool_result')) {
        // Tool tugadi, Claude davom etyapti: tool nomini oldingi yozuvdan olamiz
        afterToolResult = true;
        continue;
      }
      if (afterToolResult) continue;
      const msg = messageText(content);
      if (msg.startsWith('[Request interrupted') || msg.includes('<local-command-stdout>')) {
        return { status: 'idle', tool: '' };
      }
      return { status: 'busy', tool: '' };
    }
  }
  // Fayl o'zgardi, lekin tahlil qilib bo'lmadi (masalan, juda katta tool natijasi): ish ketyapti
  return { status: 'busy', tool: '' };
}

// Sessiya nomi: Claude panelidagi tab sarlavhasi (ai-title), bo'lmasa oxirgi savol
function transcriptInfo(text) {
  let title = '';
  let cwd = '';
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0 && (!title || !cwd); i--) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (!title && entry.type === 'custom-title' && entry.customTitle) title = entry.customTitle;
    if (!title && entry.type === 'ai-title' && entry.aiTitle) title = entry.aiTitle;
    if (!title && entry.type === 'last-prompt' && entry.lastPrompt) title = entry.lastPrompt;
    if (!cwd && entry.cwd) cwd = entry.cwd;
  }
  return { title: title.replace(/\s+/g, ' ').trim().slice(0, 60), project: cwd ? path.basename(cwd) : '' };
}

function updateTranscript(file) {
  try {
    const tail = readTail(file);
    const prev = transcripts.get(file) || {};
    const info = transcriptInfo(tail);
    transcripts.set(file, {
      id: path.basename(file, '.jsonl'),
      ...transcriptStatus(tail),
      title: info.title || prev.title || '',
      project: info.project || prev.project || '',
      ts: fs.statSync(file).mtimeMs,
    });
  } catch {
    transcripts.delete(file);
  }
}

function readHookSessions() {
  const sessions = [];
  for (const name of fs.readdirSync(SESSIONS_DIR)) {
    if (!name.endsWith('.json')) continue;
    try {
      const s = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, name), 'utf8'));
      sessions.push({ ...s, id: path.basename(name, '.json') });
    } catch {
      // Fayl yozilayotgan paytda o'qildi: keyingi o'zgarishda qayta o'qiladi
    }
  }
  return sessions;
}

// Hook va transcript ma'lumotlari sessiya bo'yicha birlashtiriladi: eng yangisi ustun
function collectSessions() {
  const now = Date.now();
  const byId = new Map();
  for (const s of [...readHookSessions(), ...transcripts.values()]) {
    const cur = byId.get(s.id);
    if (!cur) {
      byId.set(s.id, { ...s });
      continue;
    }
    if (s.ts >= cur.ts) Object.assign(cur, { status: s.status, tool: s.tool, ts: s.ts });
    cur.title = cur.title || s.title;
    cur.project = cur.project || s.project;
  }
  const sessions = [];
  for (const s of byId.values()) {
    const age = now - s.ts;
    if (age > TRANSCRIPT_STALE_MS) {
      // Uzoq vaqt jim turgan "ishlayapti" sessiya tashlab ketilgan: ro'yxatdan chiqariladi
      continue;
    }
    sessions.push({
      id: s.id,
      title: s.title || `sessiya ${s.id.slice(0, 8)}`,
      project: s.project || '',
      status: s.status,
      tool: s.tool || '',
      ts: s.ts,
    });
  }
  return sessions.sort((a, b) => b.ts - a.ts);
}

let prevSessionStatus = new Map();
let lastPayload = { type: 'claude', status: 'idle', tool: '', sessions: [] };
let lastPayloadKey = '';

function refresh(context) {
  const sessions = collectSessions();
  const status = sessions.some((s) => s.status === 'waiting')
    ? 'waiting'
    : sessions.some((s) => s.status === 'busy')
      ? 'busy'
      : 'idle';
  const tool = (sessions.find((s) => s.status === 'busy') || {}).tool || '';

  // Har bir sessiya alohida kuzatiladi: bittasi tugasa, boshqalari ishlayotgan bo'lsa ham xabar beriladi
  for (const s of sessions) {
    const prev = prevSessionStatus.get(s.id);
    if (!prev || prev === s.status) continue;
    if (s.status === 'idle') post({ type: 'finished', title: s.title, project: s.project });
    else if (s.status === 'waiting') post({ type: 'waiting', title: s.title, project: s.project });
  }
  prevSessionStatus = new Map(sessions.map((s) => [s.id, s.status]));

  const prevStatus = lastStatus;
  lastStatus = status;
  lastTool = tool;
  if (status === 'busy' && prevStatus === 'idle') {
    busySince = Date.now();
    if (vscode.workspace.getConfiguration('typingRace').get('autoOpen')) openPanel(context, true);
  }
  if (status === 'idle') busySince = 0;

  const view = sessions.map(({ id, title, project, status: st, tool: t }) => ({ id, title, project, status: st, tool: t }));
  const payload = { type: 'claude', status, tool, sessions: view };
  const key = JSON.stringify(payload);
  if (key !== lastPayloadKey) {
    lastPayloadKey = key;
    lastPayload = payload;
    post(payload);
  }
  updateStatusBar();
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
    statusItem.text = '$(keyboard) Typing Race';
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
  const media = vscode.Uri.joinPath(context.extensionUri, 'media');
  panel = vscode.window.createWebviewPanel(
    'typingRace.game',
    '⌨️ Typing Race',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus },
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [media] }
  );
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.png');
  panel.webview.html = getHtml(panel.webview, media, currentLang());
  panel.webview.onDidReceiveMessage((m) => {
    if (m.type === 'ready') {
      post({ type: 'init', best: context.globalState.get('bestWpm', 0) });
      post(lastPayload);
    } else if (m.type === 'best') {
      context.globalState.update('bestWpm', m.value);
    } else if (m.type === 'lang' && LANGS.includes(m.value)) {
      context.globalState.update('lang', m.value).then(updateStatusBar);
    } else if (m.type === 'openAuthor') {
      vscode.env.openExternal(vscode.Uri.parse(AUTHOR_URL));
    }
  });
  panel.onDidDispose(() => (panel = undefined));
}

function getHtml(webview, media, lang) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const uri = (file) => webview.asWebviewUri(vscode.Uri.joinPath(media, file));
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${uri('typing.css')}">
<title>Typing Race</title>
</head>
<body data-lang="${lang}">
  <header>
    <div class="logo"><span class="icon">⌨</span>typing<span class="sub">race</span></div>
    <div id="langs" class="langs">${LANGS.map((l) => `<button data-lang-option="${l}">${l}</button>`).join('')}</div>
  </header>
  <div id="claude-status" class="claude">
    <span class="dot"></span>
    <span class="claude-text"><span id="claude-title" class="claude-title"></span><span id="claude-sub" class="claude-sub"></span></span>
  </div>
  <div id="sessions" class="sessions"></div>
  <div id="levels" class="levels"></div>
  <main>
    <div class="live"><span id="progress">0/15</span><span id="live-wpm" class="wpm"></span></div>
    <div class="track"><div id="track-fill" class="track-fill"></div><span id="car" class="car">🏎️</span></div>
    <div id="words-wrap" class="words-wrap">
      <div id="words" class="words"></div>
      <div id="caret" class="caret"></div>
      <div id="overlay" class="overlay"><div id="overlay-title" class="title"></div><div id="overlay-text" class="text"></div></div>
    </div>
    <div class="stats">
      <div class="stat"><span class="label" data-i18n="stats.wpm"></span><span id="wpm" class="value">0</span></div>
      <div class="stat"><span class="label" data-i18n="stats.acc"></span><span id="acc" class="value">100%</span></div>
      <div class="stat"><span class="label" data-i18n="stats.streak"></span><span id="streak" class="value">0</span></div>
      <div class="stat"><span class="label" data-i18n="stats.best"></span><span id="best" class="value">0</span></div>
    </div>
  </main>
  <footer>
    <span><kbd>tab</kbd> <span data-i18n="keys.restart"></span></span>
    <span><kbd>esc</kbd> <span data-i18n="keys.pause"></span></span>
    <span><kbd>enter</kbd> <span data-i18n="keys.resume"></span></span>
    <span><kbd>backspace</kbd> <span data-i18n="keys.back"></span></span>
  </footer>
  <button id="author" class="author">by Muhammadjon Rahmatullayev <span class="in">in</span></button>
  <div id="toast" class="toast"></div>
  <script nonce="${nonce}" src="${uri('i18n.js')}"></script>
  <script nonce="${nonce}" src="${uri('words.js')}"></script>
  <script nonce="${nonce}" src="${uri('typing.js')}"></script>
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
