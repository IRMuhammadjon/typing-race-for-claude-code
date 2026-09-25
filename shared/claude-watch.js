// Claude Code sessiyalarini kuzatadi. VS Code extension ham, terminal versiya (npx zerikma) ham shundan foydalanadi.
//
// Asosiy manba: Claude Code har bir sessiyani yozib boradigan transcript fayllari
//   ~/.claude/projects/<project>/<session_id>.jsonl   (hech narsa o'rnatish shart emas)
// Ixtiyoriy manba: hook'lar yozadigan fayllar ("ruxsat so'rayapti" holati faqat shulardan bilinadi)
//   ~/.claude/typing-race/sessions/<session_id>.json
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const HOOK_SESSIONS_DIR = path.join(CLAUDE_DIR, 'typing-race', 'sessions');
// Transcript faylining faqat oxiri o'qiladi: fayl bir necha MB bo'lishi mumkin
const TAIL_BYTES = 256 * 1024;
// Shuncha vaqt o'zgarmagan sessiya tashlab ketilgan deb hisoblanadi
const STALE_MS = 15 * 60 * 1000;
// fs.watch ishlamaydigan joylarda (masalan, eski Node.js bilan Linux) fayllar shu oraliqda tekshiriladi
const POLL_MS = 1500;

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
    // queueTranscriptOnly: Claude Code faqat tarix uchun yozgan tizim xabari (masalan, sessiya qayta ochilganda
    // fon vazifasi haqidagi bildirishnoma). U yangi navbat boshlamaydi, shuning uchun "ishlayapti" hisoblanmaydi.
    if (entry.isSidechain || entry.isMeta || entry.queueTranscriptOnly || !entry.message) continue;
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

function readHookSessions() {
  const sessions = [];
  let names = [];
  try {
    names = fs.readdirSync(HOOK_SESSIONS_DIR);
  } catch {
    return sessions; // hook'lar o'rnatilmagan
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const s = JSON.parse(fs.readFileSync(path.join(HOOK_SESSIONS_DIR, name), 'utf8'));
      sessions.push({ ...s, id: path.basename(name, '.json') });
    } catch {
      // Fayl yozilayotgan paytda o'qildi: keyingi o'zgarishda qayta o'qiladi
    }
  }
  return sessions;
}

// Kuzatuvchini ishga tushiradi. Qayta chaqiriladigan funksiyalar:
//   onUpdate({ status, tool, sessions })   umumiy holat o'zgarganda
//   onFinished(session)                     bitta sessiya ishini tugatganda
//   onWaiting(session)                      sessiya ruxsat so'raganda (faqat hook'lar bilan)
function createWatcher({ onUpdate = () => {}, onFinished = () => {}, onWaiting = () => {} } = {}) {
  const transcripts = new Map(); // fayl yo'li -> { id, status, tool, title, project, ts }
  let prevStatus = new Map();
  let lastKey = '';
  let state = { status: 'idle', tool: '', sessions: [] };
  const timers = [];
  const watchers = [];

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

  // Yaqinda o'zgargan transcriptlarni topadi; mtime o'zgarmaganlarini qayta o'qimaydi
  function scan() {
    const now = Date.now();
    let projects = [];
    try {
      projects = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
    } catch {
      return;
    }
    for (const project of projects) {
      if (!project.isDirectory()) continue;
      const dir = path.join(PROJECTS_DIR, project.name);
      let names = [];
      try {
        names = fs.readdirSync(dir);
      } catch {
        continue;
      }
      for (const name of names) {
        if (!name.endsWith('.jsonl')) continue;
        const file = path.join(dir, name);
        try {
          const mtime = fs.statSync(file).mtimeMs;
          const known = transcripts.get(file);
          if (now - mtime < STALE_MS && (!known || known.ts !== mtime)) updateTranscript(file);
        } catch {
          // Fayl o'chirilgan bo'lishi mumkin
        }
      }
    }
  }

  // Hook va transcript ma'lumotlari sessiya bo'yicha birlashtiriladi: eng yangisi ustun
  function collect() {
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
    return [...byId.values()]
      .filter((s) => now - s.ts <= STALE_MS)
      .map((s) => ({
        id: s.id,
        title: s.title || `session ${s.id.slice(0, 8)}`,
        project: s.project || '',
        status: s.status,
        tool: s.tool || '',
        ts: s.ts,
      }))
      .sort((a, b) => b.ts - a.ts);
  }

  function refresh() {
    const sessions = collect();
    const status = sessions.some((s) => s.status === 'waiting')
      ? 'waiting'
      : sessions.some((s) => s.status === 'busy')
        ? 'busy'
        : 'idle';
    const tool = (sessions.find((s) => s.status === 'busy') || {}).tool || '';

    // Har bir sessiya alohida kuzatiladi: bittasi tugasa, boshqalari ishlayotgan bo'lsa ham xabar beriladi
    for (const s of sessions) {
      const prev = prevStatus.get(s.id);
      if (!prev || prev === s.status) continue;
      if (s.status === 'idle') onFinished(s);
      else if (s.status === 'waiting') onWaiting(s);
    }
    prevStatus = new Map(sessions.map((s) => [s.id, s.status]));

    state = {
      status,
      tool,
      sessions: sessions.map(({ id, title, project, status: st, tool: t }) => ({ id, title, project, status: st, tool: t })),
    };
    const key = JSON.stringify(state);
    if (key !== lastKey) {
      lastKey = key;
      onUpdate(state);
    }
  }

  let debounce;
  const scheduleRefresh = () => {
    clearTimeout(debounce);
    debounce = setTimeout(refresh, 80);
  };

  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  scan();

  const pending = new Map();
  try {
    watchers.push(
      fs.watch(PROJECTS_DIR, { recursive: true }, (_event, filename) => {
        if (!filename || !filename.endsWith('.jsonl')) return;
        // Faqat <project>/<session>.jsonl: subagent transcriptlari hisobga olinmaydi
        if (filename.split(/[\\/]/).length !== 2) return;
        const file = path.join(PROJECTS_DIR, filename);
        clearTimeout(pending.get(file));
        pending.set(
          file,
          setTimeout(() => {
            pending.delete(file);
            updateTranscript(file);
            scheduleRefresh();
          }, 100)
        );
      })
    );
  } catch {
    // recursive watch bu platformada yo'q: davriy tekshiruvga o'tamiz
    timers.push(
      setInterval(() => {
        scan();
        refresh();
      }, POLL_MS)
    );
  }

  try {
    fs.mkdirSync(HOOK_SESSIONS_DIR, { recursive: true });
    watchers.push(fs.watch(HOOK_SESSIONS_DIR, scheduleRefresh));
  } catch {
    // Hook papkasi bo'lmasa ham asosiy kuzatuv ishlayveradi
  }

  // Eskirgan sessiyalarni vaqti-vaqti bilan tozalash uchun
  timers.push(setInterval(refresh, 30 * 1000));
  refresh();

  return {
    refresh,
    state: () => state,
    close() {
      for (const w of watchers) w.close();
      for (const t of timers) clearInterval(t);
      for (const t of pending.values()) clearTimeout(t);
      clearTimeout(debounce);
    },
  };
}

module.exports = { createWatcher, transcriptStatus, transcriptInfo, HOOK_SESSIONS_DIR, CLAUDE_DIR };
