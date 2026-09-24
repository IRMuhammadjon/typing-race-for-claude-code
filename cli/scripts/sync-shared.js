// npm paketiga repo ildizidagi shared/ fayllarini ko'chiradi (npm pack / publish oldidan avtomatik ishlaydi)
const fs = require('fs');
const path = require('path');

const from = path.join(__dirname, '..', '..', 'shared');
const to = path.join(__dirname, '..', 'shared');
fs.mkdirSync(to, { recursive: true });
for (const name of fs.readdirSync(from)) {
  if (name.endsWith('.js')) fs.copyFileSync(path.join(from, name), path.join(to, name));
}
fs.copyFileSync(path.join(__dirname, '..', '..', 'LICENSE'), path.join(__dirname, '..', 'LICENSE'));
console.log('shared files synced');
