/* eslint-disable */
/**
 * Fails if a real secret looks committed.
 *
 * Scans the given roots (skipping node_modules / build output) for assignments
 * that are *not* obviously placeholders. The rule is deliberately conservative:
 * a value only trips the check when it is long enough to be a real credential
 * AND is not one of the documented placeholder forms.
 *
 * Usage:  node scripts/audit-secrets.cjs [root ...]
 * Exit:   0 clean, 1 findings.
 */
const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set([
  'node_modules', '.next', 'dist', 'build', 'uploads', '.git', 'out',
  'mongodb-binaries', 'coverage', '.nyc_output',
]);
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.yaml', '.yml']);

/** Keys whose values are secrets, with the shape each must have. */
const SECRET_RULES = [
  { name: 'Razorpay key secret', re: /RAZORPAY_SECRET\s*[=:]\s*["']?([^\s"'#]+)/gi, min: 12 },
  { name: 'Razorpay webhook secret', re: /RAZORPAY_WEBHOOK_SECRET\s*[=:]\s*["']?([^\s"'#]+)/gi, min: 12 },
  { name: 'JWT secret', re: /JWT_(?:REFRESH_)?SECRET\s*[=:]\s*["']?([^\s"'#]+)/gi, min: 16 },
  { name: 'MongoDB URI with credentials', re: /MONGO_URI\s*[=:]\s*["']?(mongodb(?:\+srv)?:\/\/[^\s"'#]+)/gi, min: 0 },
  { name: 'Redis URL with credentials', re: /REDIS_URL\s*[=:]\s*["']?(rediss?:\/\/[^\s"'#]+)/gi, min: 0 },
  { name: 'Cloudinary URL with credentials', re: /CLOUDINARY_URL\s*[=:]\s*["']?(cloudinary:\/\/[^\s"'#]+)/gi, min: 0 },
  { name: 'SMTP password', re: /SMTP_PASS(?:WORD)?\s*[=:]\s*["']?([^\s"'#]+)/gi, min: 6 },
  { name: 'AWS secret key', re: /AWS_SECRET_ACCESS_KEY\s*[=:]\s*["']?([^\s"'#]+)/gi, min: 20 },
  { name: 'AWS access key id', re: /AWS_ACCESS_KEY_ID\s*[=:]\s*["']?(AKIA[^\s"'#]*)/gi, min: 0 },
  { name: 'Mapbox secret token', re: /NEXT_PUBLIC_MAPBOX_TOKEN\s*[=:]\s*["']?(sk\.[^\s"'#]+)/gi, min: 0 },
  { name: 'Mock payment signing key', re: /MOCK_PAYMENT_KEY\s*[=:]\s*["']?([^\s"'#]+)/gi, min: 12 },
];

/** Values that are clearly placeholders, documentation or empty. */
const PLACEHOLDER = [
  '', '-', 'x', 'your-', 'change', 'replace', 'none', 'null', 'undefined', 'true', 'false',
  'example', 'placeholder', 'todo', 'xxx', 'changeme', 'change-me', 'your_key', 'your-key',
  'sk.your', 'pk.your', 'rzp_test_your', 'rzp_live_your', 'process.env',
];

const isPlaceholder = (value) => {
  const v = String(value ?? '').trim().replace(/^["']|["']$/g, '');
  if (!v) return true;
  const lower = v.toLowerCase();
  if (PLACEHOLDER.some((p) => lower.startsWith(p))) return true;
  // `mongodb+srv://USER:PASSWORD@…`, `cloudinary://key:secret@cloud`, … in docs.
  if (/\b(user|password|apikey|api_key|api-secret|api_secret|xxxx|<[^>]+>|your|cxample|domain|project|cluster0|localhost)/i.test(v)) return true;
  if (v.includes('${') || v.includes('<') || v.includes('…')) return true;
  return false;
};

const collect = (root) => {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (EXTS.has(path.extname(entry.name)) || /^\.env/.test(entry.name)) files.push(full);
    }
  };
  walk(root);
  return files;
};

const roots = process.argv.slice(2);
if (roots.length === 0) roots.push('src', 'test', 'scripts');

const findings = [];
let scanned = 0;

for (const root of roots) {
  for (const file of collect(path.resolve(root))) {
    scanned += 1;
    const text = fs.readFileSync(file, 'utf8');
    for (const rule of SECRET_RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(text)) !== null) {
        const value = m[1];
        if (rule.min > 0 && String(value ?? '').length < rule.min) continue;
        if (isPlaceholder(value)) continue;
        findings.push({
          file: path.relative(process.cwd(), file),
          rule: rule.name,
          line: text.slice(0, m.index).split('\n').length,
        });
      }
    }
  }
}

console.log(`scanned ${scanned} file(s) for secrets`);
if (findings.length === 0) {
  console.log('RESULT: clean - no live secrets found');
} else {
  console.log(`RESULT: ${findings.length} POTENTIAL SECRET(S)`);
  for (const f of findings) console.log(`  ${f.file}:${f.line}  ${f.rule}`);
  process.exitCode = 1;
}
