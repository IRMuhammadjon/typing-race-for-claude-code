// Yangiliklar boti: Claude Code changelog'idagi yangi versiyalardan foydalanuvchiga foydali maslahatlar
// yozdiradi (en/uz/ru) va shared/news-feed.json boshiga qo'shadi. GitHub Actions'da kuniga bir marta
// ishlaydi (.github/workflows/news.yml), natija Pull Request bo'lib ochiladi va odam tasdiqlaydi.
//
//   node update-news.mjs              changelog'ni o'qiydi, Claude'ga yozdiradi, faylni yangilaydi
//   node update-news.mjs --dry-run    Claude'ga yuboriladigan matnni ko'rsatadi, hech narsa o'zgartirmaydi
//   node update-news.mjs --fake F     Claude o'rniga F faylidagi javobni ishlatadi (sinov uchun)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import newsModule from '../../shared/news.js';

const { validItem } = newsModule;
const here = path.dirname(fileURLToPath(import.meta.url));
// NEWS_FEED_FILE: sinovda haqiqiy fayl o'rniga nusxasi bilan ishlash uchun
const FEED_FILE = process.env.NEWS_FEED_FILE || path.join(here, '..', '..', 'shared', 'news-feed.json');
const CHANGELOG_URL = 'https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md';
const CHANGELOG_PAGE = 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md';
// Bir ishga tushishda ko'pi bilan shuncha yangi versiya ko'rib chiqiladi va shuncha maslahat qo'shiladi
const MAX_VERSIONS = 8;
const MAX_TIPS = 3;
// Maslahatni "Claude hozir nima qilyapti" ga bog'lash uchun tool nomlari (Zerikma shular bo'yicha mos maslahat ko'rsatadi)
const TOOLS = ['Bash', 'Edit', 'Write', 'Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'Agent'];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fakeFile = args.includes('--fake') ? args[args.indexOf('--fake') + 1] : null;

const SYSTEM = `You write short tips for Zerikma, a VS Code and terminal extension that shows Claude Code tips while Claude is working.

You get the newest Claude Code release notes. Pick at most ${MAX_TIPS} changes that an everyday Claude Code user can try right away: a new slash command, keyboard shortcut, flag, setting or visible feature. Skip bug fixes, enterprise or managed-settings changes, cloud-provider specifics and anything that needs special access. If nothing qualifies, return an empty list.

For each tip:
- version: the release it comes from, exactly as written in the notes.
- slug: 2 to 5 lowercase words joined by hyphens.
- command: the exact command, shortcut, flag or setting name from the notes, or "" if there is none.
- tools: the Claude Code tools this tip relates to, from the allowed list, or [].
- category: the closest topic from the allowed list.
- level: "beginner" if anyone can try it in a minute, "advanced" if it needs config files, scripts or several steps.
- title: at most 7 words.
- body: at most 2 short sentences, second person, saying what it does and when it helps.

Write title and body in three languages: English (en), Uzbek in Latin script (uz) and Russian (ru). In Uzbek use the apostrophe ' in o', g' and similar letters. Keep command names, flags, keys and setting names exactly as in the notes in every language. Use only facts from the notes; do not invent behavior. Do not repeat a topic from the existing tip ids.`;

// Yangiliklar tabidagi mavzular (media/games/news.js dagi CATS bilan bir xil)
const CATEGORIES = ['workflow', 'shortcuts', 'memory', 'hooks', 'agents', 'skills', 'mcp', 'permissions', 'automation', 'plugins'];

const LANG_TEXT = {
  type: 'object',
  additionalProperties: false,
  required: ['en', 'uz', 'ru'],
  properties: { en: { type: 'string' }, uz: { type: 'string' }, ru: { type: 'string' } },
};
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['version', 'slug', 'command', 'tools', 'category', 'level', 'title', 'body'],
        properties: {
          version: { type: 'string' },
          slug: { type: 'string' },
          command: { type: 'string' },
          tools: { type: 'array', items: { type: 'string', enum: TOOLS } },
          category: { type: 'string', enum: CATEGORIES },
          level: { type: 'string', enum: ['beginner', 'advanced'] },
          title: LANG_TEXT,
          body: LANG_TEXT,
        },
      },
    },
  },
};

// "## 2.1.282" sarlavhalari va ularning ostidagi "- ..." qatorlari; eng yangisi birinchi
function parseChangelog(md) {
  const sections = [];
  let current = null;
  for (const line of md.split('\n')) {
    const heading = /^## (\d+\.\d+\.\d+)\s*$/.exec(line);
    if (heading) {
      current = { version: heading[1], bullets: [] };
      sections.push(current);
    } else if (current && line.startsWith('- ')) {
      current.bullets.push(line.slice(2).trim());
    }
  }
  return sections;
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

async function askClaude(userText) {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    // Model rad etsa, API so'rovni mos fallback modelda qayta bajaradi
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{ role: 'user', content: userText }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  });
  if (response.stop_reason === 'refusal') throw new Error(`Claude declined: ${response.stop_details?.category ?? 'unknown'}`);
  if (response.stop_reason === 'max_tokens') throw new Error('Response was cut off (max_tokens)');
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  return JSON.parse(text);
}

const isFilled = (field) => field && ['en', 'uz', 'ru'].every((lang) => typeof field[lang] === 'string' && field[lang].trim());

function toFeedItems(result, knownIds, versions) {
  const today = new Date().toISOString().slice(0, 10);
  const items = [];
  for (const tip of result.items || []) {
    if (items.length >= MAX_TIPS) break;
    if (!versions.has(tip.version) || !isFilled(tip.title) || !isFilled(tip.body)) continue;
    const slug = String(tip.slug).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const id = `cl-${tip.version}-${slug}`;
    if (!slug || knownIds.has(id)) continue;
    const item = {
      id,
      date: today,
      kind: 'tip',
      level: tip.level === 'advanced' ? 'advanced' : 'beginner',
      category: CATEGORIES.includes(tip.category) ? tip.category : 'workflow',
      source: 'changelog',
      version: tip.version,
      command: tip.command || '',
      tools: (tip.tools || []).filter((t) => TOOLS.includes(t)),
      link: CHANGELOG_PAGE,
      title: tip.title,
      body: tip.body,
    };
    if (!validItem(item)) continue;
    knownIds.add(id);
    items.push(item);
  }
  return items;
}

async function main() {
  const feed = JSON.parse(fs.readFileSync(FEED_FILE, 'utf8'));
  const res = await fetch(CHANGELOG_URL);
  if (!res.ok) throw new Error(`Changelog HTTP ${res.status}`);
  const sections = parseChangelog(await res.text());
  if (!sections.length) throw new Error('No versions found in the changelog');

  const last = feed.changelog && feed.changelog.lastVersion;
  if (!last) {
    // Birinchi ishga tushish: eski versiyalar uchun maslahat yozmaymiz, faqat boshlang'ich nuqtani belgilaymiz
    feed.changelog = { lastVersion: sections[0].version };
    if (!dryRun) fs.writeFileSync(FEED_FILE, JSON.stringify(feed, null, 2) + '\n');
    console.log(`Initialized at ${sections[0].version}`);
    return;
  }

  const fresh = sections.filter((s) => compareVersions(s.version, last) > 0).slice(0, MAX_VERSIONS);
  if (!fresh.length) {
    console.log(`No new versions after ${last}`);
    return;
  }

  const knownIds = new Set(feed.items.map((item) => item.id));
  const notes = fresh.map((s) => `## ${s.version}\n${s.bullets.map((b) => `- ${b}`).join('\n')}`).join('\n\n');
  const userText = `Allowed tools: ${TOOLS.join(', ')}\nExisting tip ids: ${[...knownIds].join(', ')}\n\nRelease notes:\n\n${notes}`;

  if (dryRun) {
    console.log(`New versions: ${fresh.map((s) => s.version).join(', ')}\n\n${userText}`);
    return;
  }

  const result = fakeFile ? JSON.parse(fs.readFileSync(fakeFile, 'utf8')) : await askClaude(userText);
  const items = toFeedItems(result, knownIds, new Set(fresh.map((s) => s.version)));

  feed.items = [...items, ...feed.items];
  feed.changelog.lastVersion = fresh[0].version;
  fs.writeFileSync(FEED_FILE, JSON.stringify(feed, null, 2) + '\n');

  const summary = items.length
    ? items.map((i) => `- **${i.title.en}** (${i.version})\n  - uz: ${i.title.uz}\n  - ru: ${i.title.ru}`).join('\n')
    : '_No user-facing tips in these releases; only the version marker moved._';
  console.log(`Versions ${fresh.map((s) => s.version).join(', ')} -> ${items.length} tip(s)\n${summary}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `tips=${items.length}\n`);
  fs.writeFileSync(path.join(here, 'pr-body.md'), `New Claude Code tips generated from the changelog (${fresh.map((s) => s.version).join(', ')}).\n\n${summary}\n\nPlease check the Uzbek and Russian wording before merging.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
