#!/usr/bin/env node
// Claude Code hook: Claude holatini ~/.claude/typing-race/sessions/<session_id>.json ga yozadi.
// Hech narsa chop etmaydi (UserPromptSubmit stdout'i Claude kontekstiga qo'shiladi)
// va har doim 0 kodi bilan chiqadi, shunda Claude ishiga hech qachon xalaqit bermaydi.
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = path.join(os.homedir(), '.claude', 'typing-race', 'sessions');

let raw = '';
let finished = false;
function done() {
  if (finished) return;
  finished = true;
  try {
    handle(JSON.parse(raw || '{}'));
  } catch {
    // Jim: hook xatosi Claude'ni to'xtatmasligi kerak
  }
  process.exit(0);
}
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', done);
setTimeout(done, 2000);

function isPermissionPrompt(input) {
  return input.notification_type === 'permission_prompt' || /permission/i.test(input.message || '');
}

function handle(input) {
  const event = input.hook_event_name;
  const id = String(input.session_id || 'default').replace(/[^\w-]/g, '_');
  const file = path.join(DIR, id + '.json');

  if (event === 'SessionEnd') {
    fs.rmSync(file, { force: true });
    return;
  }

  let status;
  if (event === 'UserPromptSubmit' || event === 'PreToolUse' || event === 'PostToolUse') status = 'busy';
  else if (event === 'Stop') status = 'idle';
  else if (event === 'Notification' && isPermissionPrompt(input)) status = 'waiting';
  else return;

  fs.mkdirSync(DIR, { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ status, tool: input.tool_name || '', ts: Date.now() }));
  fs.renameSync(tmp, file);
}
