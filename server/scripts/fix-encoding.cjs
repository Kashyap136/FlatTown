/* eslint-disable */
/**
 * Repairs mojibake introduced by repeated UTF-8 <-> CP1252 round trips.
 *
 * Some source files were written through a pipeline that decoded UTF-8 bytes as
 * Windows-1252 and re-encoded them, so characters such as EM DASH (U+2014) and
 * RUPEE SIGN (U+20B9) ended up stored as "â€”" and "Ã¢â€šÂ¹".
 *
 * The inverse of that mangling is, for one round:
 *     bytes  = CP1252.encode(mojibakeRun)
 *     result = UTF8.decode(bytes)
 *
 * The script walks the text as a sequence of runs and repairs each run
 * independently, because legitimate characters (RUPEE SIGN, ARROW, ...) are not
 * CP1252-encodable and would otherwise make the whole file unrepairable. A run
 * is only rewritten when the result strictly lowers the number of characters
 * outside ALLOWED, so clean text is never touched.
 *
 * Usage:  node scripts/fix-encoding.cjs [--write] [root ...]
 */
const fs = require('fs');
const path = require('path');

/** Characters that legitimately appear in this codebase. */
const ALLOWED = new Set([
  0x2500, // BOX DRAWINGS LIGHT HORIZONTAL
  0x20b9, // RUPEE SIGN
  0x2013, // EN DASH
  0x2014, // EM DASH
  0x2192, // RIGHTWARDS ARROW
  0x2194, // LEFT RIGHT ARROW
  0x21d4, // RIGHTWARDS DOUBLE ARROW
  0x00d7, // MULTIPLICATION SIGN
  0x2212, // MINUS SIGN
  0x2026, // HORIZONTAL ELLIPSIS
  0x2192,
]);

// Windows-1252 differs from Latin-1 only in 0x80-0x9F.
const HIGH = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
  0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
  0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
  0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
  0x9e: 0x017e, 0x9f: 0x0178,
};

const CP1252_TO_BYTE = new Map();
for (let b = 0; b < 0x100; b += 1) {
  CP1252_TO_BYTE.set(b >= 0x80 && HIGH[b] !== undefined ? HIGH[b] : b, b);
}

/** Strict UTF-8 decode; returns null on any malformed sequence. */
function utf8Decode(bytes) {
  const out = [];
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i];
    let cp;
    let size;
    if (b0 < 0x80) { cp = b0; size = 1; }
    else if ((b0 & 0xe0) === 0xc0) { cp = b0 & 0x1f; size = 2; }
    else if ((b0 & 0xf0) === 0xe0) { cp = b0 & 0x0f; size = 3; }
    else if ((b0 & 0xf8) === 0xf0) { cp = b0 & 0x07; size = 4; }
    else return null;
    if (i + size > bytes.length) return null;
    for (let k = 1; k < size; k += 1) {
      const bk = bytes[i + k];
      if ((bk & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (bk & 0x3f);
    }
    out.push(cp);
    i += size;
  }
  return out;
}

const cpOf = (text) => Array.from(text, (c) => c.codePointAt(0));
const fromCp = (cps) => cps.map((cp) => String.fromCodePoint(cp)).join('');

/** How many characters sit outside ALLOWED; lower is better. */
const score = (text) => cpOf(text).filter((cp) => cp > 0x7e && !ALLOWED.has(cp)).length;

const encodable = (cp) => CP1252_TO_BYTE.has(cp);

/**
 * A run is repaired on its own, so anything that is either not CP1252-encodable
 * or already correct acts as a hard boundary. Without this, one legitimate
 * EM DASH (byte 0x97, a UTF-8 continuation byte) would make the whole file
 * undecodable and hide every mangled sequence around it.
 */
const boundary = (cp) => !encodable(cp) || ALLOWED.has(cp);

/** One inverse round over a run, or null when the run is not representable. */
function unround(cps) {
  const bytes = [];
  for (const cp of cps) {
    const byte = CP1252_TO_BYTE.get(cp);
    if (byte === undefined) return null;
    bytes.push(byte);
  }
  return utf8Decode(bytes);
}

/** Applies rounds until the score stops improving; returns null if unchanged. */
function repairRun(cps) {
  let best = cps;
  let bestScore = score(fromCp(cps));
  if (bestScore === 0) return null;
  let current = cps;
  for (let round = 0; round < 5; round += 1) {
    const next = unround(current);
    if (next === null) break;
    const nextScore = score(fromCp(next));
    if (nextScore >= bestScore) break;
    best = next;
    bestScore = nextScore;
    current = next;
  }
  return bestScore < score(fromCp(cps)) ? best : null;
}

function repair(text) {
  const cps = cpOf(text);
  const out = [];
  let i = 0;
  let changed = false;
  while (i < cps.length) {
    if (cps[i] === 0xfeff) { changed = true; i += 1; continue; } // BOM: dropped
    if (boundary(cps[i])) { out.push(cps[i]); i += 1; continue; }
    let j = i;
    while (j < cps.length && !boundary(cps[j])) j += 1;
    const run = cps.slice(i, j);
    const fixed = repairRun(run);
    if (fixed) { out.push(...fixed); changed = true; }
    else out.push(...run);
    i = j;
  }
  return { text: fromCp(out), changed };
}

function collectFiles(root) {
  const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.css']);
  const skip = new Set(['node_modules', '.next', 'dist', 'build', 'uploads', '.git', 'out', 'coverage']);
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (exts.has(path.extname(entry.name))) files.push(full);
    }
  };
  walk(root);
  return files;
}

const args = process.argv.slice(2);
const write = args.includes('--write');
const roots = args.filter((a) => !a.startsWith('--'));
const targets = (roots.length ? roots : [path.resolve(__dirname, '..', 'src')]).map((r) => path.resolve(r));

let touched = 0;
for (const root of targets) {
  if (!fs.existsSync(root)) continue;
  const files = fs.statSync(root).isDirectory() ? collectFiles(root) : [root];
  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    const hadBom = original.charCodeAt(0) === 0xfeff;
    const text0 = hadBom ? original.slice(1) : original;
    if (!hadBom && !/[^\x00-\x7e]/.test(text0)) continue;
    const { text, changed } = repair(text0);
    if (!changed) continue;
    touched += 1;
    const rel = path.relative(process.cwd(), file);
    process.stdout.write(
      `${write ? 'fixed' : 'would fix'} ${rel}  suspicious ${score(original)} -> ${score(text)}\n`,
    );
    if (write) fs.writeFileSync(file, text, 'utf8');
  }
}
process.stdout.write(`\n${touched} file(s) ${write ? 'rewritten' : 'need repair'} (write=${write})\n`);