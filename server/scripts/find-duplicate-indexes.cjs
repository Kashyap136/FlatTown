/* eslint-disable */
/**
 * Removes `schema.index({ singleKey: 1 })` lines whose key is already indexed
 * by a path-level `index: true` / `unique: true`, which makes Mongoose log a
 * duplicate-index warning on every boot.
 *
 * Run with `--write` to apply the edits.
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'src', 'models');
const write = process.argv.includes('--write');
let removed = 0;

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
  const full = path.join(dir, file);
  const text = fs.readFileSync(full, 'utf8');

  const indexed = new Set();
  const pathRe = /([A-Za-z_][\w.]*)\s*:\s*\{[^}]*?\b(?:index|unique)\s*:\s*true/g;
  let m;
  while ((m = pathRe.exec(text))) if (!m[1].includes('.')) indexed.add(m[1]);

  const lines = text.split('\n');
  const kept = lines.filter((line) => {
    const match = /^[A-Za-z_$][\w$]*Schema\.index\(\s*\{\s*([A-Za-z_][\w]*)\s*:\s*(-?1)\s*\}\s*(?:,\s*\{[^}]*\})?\s*\)\s*;?\s*$/.exec(
      line,
    );
    if (match && indexed.has(match[1])) {
      removed += 1;
      return false;
    }
    return true;
  });

  if (kept.length !== lines.length) {
    if (write) fs.writeFileSync(full, kept.join('\n'), 'utf8');
    console.log(`${file}: ${lines.length - kept.length} duplicate index line(s) ${write ? 'removed' : 'to remove'}`);
  }
}

console.log(`\n${removed} duplicate index definition(s) ${write ? 'removed' : 'found'}`);