/* eslint-disable */
/**
 * Lists every non-ASCII code point in the given files/directories so that
 * legitimate characters (RUPEE SIGN, EM DASH, ...) can be told apart from
 * mojibake.  Usage: node scripts/inventory-nonascii.cjs <root ...>
 */
const fs = require('fs');
const path = require('path');

const HIGH = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
  0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
  0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
  0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
  0x9e: 0x017e, 0x9f: 0x0178,
};
const cp1252Only = new Set(Object.values(HIGH));

/*
 * Mojibake is not a single code point — it is a *run* of them. When UTF-8 bytes
 * are decoded as CP1252 and re-encoded, `₹` (E2 82 B9) becomes the three code
 * points `â` `€` `©` (U+00E2 U+20AC U+00A9). A lone U+2019 or U+2014 is just a
 * curly quote or an em dash, correctly UTF-8 encoded.
 *
 * So: a lead byte in the Latin-1 supplement (U+0080–U+00FF) is the tell. Only
 * report a code point as suspicious when it actually appears next to one.
 */
const isLatin1Lead = (cp) => cp >= 0x00a2 && cp <= 0x00ff;
const isMojibakeRun = (text) => {
  const runs = [];
  for (let i = 0; i < text.length; i += 1) {
    if (!isLatin1Lead(text.codePointAt(i))) continue;
    // Walk forward over the classic `lead + cp1252-high` run.
    const run = [text[i]];
    let j = i + 1;
    while (j < text.length) {
      const cp = text.codePointAt(j);
      if (isLatin1Lead(cp) || cp1252Only.has(cp) || (cp >= 0x2000 && cp <= 0x20ff)) {
        run.push(text[j]);
        j += text[j].length;
      } else break;
    }
    if (run.length >= 2) runs.push(run.join(''));
    i = j - 1;
  }
  return runs;
};

function collect(root) {
  const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.css']);
  const skip = new Set(['node_modules', '.next', 'dist', 'build', 'uploads', '.git', 'out']);
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (exts.has(path.extname(entry.name))) files.push(full);
    }
  };
  if (fs.statSync(root).isDirectory()) walk(root);
  else files.push(root);
  return files;
}

const roots = (process.argv.slice(2).length ? process.argv.slice(2) : ['src']).map((r) => path.resolve(r));
const tally = new Map();

for (const root of roots) {
  for (const file of collect(root)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp <= 0x7e) continue;
      const key = cp;
      const entry = tally.get(key) || { count: 0, files: new Set(), sample: '', mojibake: 0 };
      entry.count += 1;
      entry.files.add(path.relative(process.cwd(), file));
      if (isMojibakeRun(text).length) entry.mojibake += 1;
      if (!entry.sample) {
        const i = text.indexOf(ch);
        entry.sample = JSON.stringify(text.slice(Math.max(0, i - 30), i + 30));
      }
      tally.set(key, entry);
    }
  }
}

const rows = [...tally.entries()].sort((a, b) => b[1].count - a[1].count);
let suspect = 0;
for (const [cp, entry] of rows) {
  // Flagged only when this code point was seen inside a mojibake run.
  const flag = entry.mojibake > 0 ? 'MOJIBAKE?' : 'ok';
  if (entry.mojibake > 0) suspect += 1;
  process.stdout.write(
    `U+${cp.toString(16).toUpperCase().padStart(4, '0')} ${String.fromCodePoint(cp)}\t${flag}\t${entry.count}\t${entry.files.size} file(s)\n`,
  );
  if (entry.mojibake > 0) process.stdout.write(`    ${entry.sample}\n`);
}
process.stdout.write(`\n${rows.length} distinct non-ASCII code point(s), ${suspect} suspicious\n`);
process.exitCode = suspect > 0 ? 1 : 0;