'use strict';
// Copy the built website (../dist, from `npm run build` in the repo root) into the app.
const fs = require('node:fs');
const path = require('node:path');

const from = path.join(__dirname, '..', '..', 'dist');
const to = path.join(__dirname, '..', 'web');
if (!fs.existsSync(path.join(from, 'index.html'))) {
  console.error('No ../dist/index.html: run `npm run build` in the repo root first.');
  process.exit(1);
}
fs.rmSync(to, { recursive: true, force: true });
fs.cpSync(from, to, { recursive: true });
console.log(`copied ${from} → ${to}`);
