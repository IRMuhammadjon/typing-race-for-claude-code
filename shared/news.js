// Yangiliklar (Claude Code maslahatlari): extension ichidagi fayl + GitHub'dagi yangilangan nusxa.
// Tarjima foydalanuvchi kompyuterida qilinmaydi: har bir maslahat en/uz/ru matni bilan tayyor keladi
// (yangilarini .github/workflows/news.yml boti yozadi). Foydalanuvchi haqida hech narsa yuborilmaydi.
const fs = require('fs');
const os = require('os');
const path = require('path');

const REMOTE_URL = 'https://raw.githubusercontent.com/IRMuhammadjon/typing-race-for-claude-code/main/shared/news-feed.json';
const BUNDLED_FILE = path.join(__dirname, 'news-feed.json');
const CACHE_FILE = path.join(os.homedir(), '.claude', 'typing-race', 'news-cache.json');
// GitHub'ga ko'pi bilan shuncha vaqtda bir marta murojaat qilinadi
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
const LANGS = ['en', 'uz', 'ru'];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const isText = (v) => typeof v === 'string' && v.trim().length > 0;

// Tashqaridan kelgan faylga ishonmaymiz: faqat to'g'ri tuzilgan yozuvlar olinadi
function validItem(item) {
  return (
    item &&
    isText(item.id) &&
    item.title &&
    item.body &&
    isText(item.title.en) &&
    isText(item.body.en) &&
    (!item.link || /^https:\/\//.test(item.link)) &&
    (item.code === undefined || typeof item.code === 'string') &&
    (item.kind !== 'quiz' ||
      (Array.isArray(item.options) &&
        item.options.length >= 2 &&
        item.options.every((o) => o && isText(o.en)) &&
        Number.isInteger(item.answer) &&
        item.answer >= 0 &&
        item.answer < item.options.length))
  );
}

// Bir nechta manbani id bo'yicha birlashtiradi (keyingisi ustun), yangilari birinchi
function merge(...feeds) {
  const byId = new Map();
  for (const feed of feeds) {
    if (!feed || !Array.isArray(feed.items)) continue;
    for (const item of feed.items) if (validItem(item)) byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

async function fetchRemote(fetchImpl) {
  const res = await fetchImpl(REMOTE_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const feed = await res.json();
  if (!feed || !Array.isArray(feed.items)) throw new Error('bad feed');
  return feed;
}

// online: false bo'lsa internetga umuman chiqilmaydi (sozlama yoki --offline)
async function loadNews({ online = true, fetchImpl = globalThis.fetch } = {}) {
  const bundled = readJson(BUNDLED_FILE);
  let cache = readJson(CACHE_FILE);
  const stale = !cache || Date.now() - (cache.fetchedAt || 0) > MAX_AGE_MS;
  if (online && fetchImpl && stale) {
    try {
      cache = { fetchedAt: Date.now(), feed: await fetchRemote(fetchImpl) };
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
    } catch {
      // Internet yo'q yoki GitHub javob bermadi: ichidagi nusxa va oldingi kesh bilan ishlaymiz
    }
  }
  return merge(bundled, cache && cache.feed);
}

// Tanlangan tildagi matn; tarjima bo'lmasa inglizchasi
function localize(item, lang) {
  const pick = (field) => (field && (field[lang] || field.en)) || '';
  return {
    id: item.id,
    date: item.date || '',
    command: item.command || '',
    tools: Array.isArray(item.tools) ? item.tools : [],
    link: item.link || '',
    source: item.source || '',
    title: pick(item.title),
    body: pick(item.body),
  };
}

module.exports = { loadNews, localize, merge, validItem, REMOTE_URL, BUNDLED_FILE, LANGS };
