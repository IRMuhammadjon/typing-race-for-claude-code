// npm paketiga repo ildizidagi shared/ fayllarini ko'chiradi (npm pack / publish oldidan avtomatik ishlaydi).
// --clean: paketlashdan keyin nusxalarni o'chiradi, aks holda ishlab chiqishda eskirgan nusxa o'qilib qoladi.
const fs = require('fs');
const path = require('path');

const cli = path.join(__dirname, '..');
const to = path.join(cli, 'shared');
const license = path.join(cli, 'LICENSE');

if (process.argv.includes('--clean')) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.rmSync(license, { force: true });
  console.log('shared copies removed');
  process.exit(0);
}

const from = path.join(cli, '..', 'shared');
fs.mkdirSync(to, { recursive: true });
for (const name of fs.readdirSync(from)) {
  if (name.endsWith('.js')) fs.copyFileSync(path.join(from, name), path.join(to, name));
}
fs.copyFileSync(path.join(cli, '..', 'LICENSE'), license);
console.log('shared files synced');
