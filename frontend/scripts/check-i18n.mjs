#!/usr/bin/env node
/**
 * i18n coverage checker.
 *
 * Scans src/ for literal translation keys passed to t(...) / i18n.t(...) and
 * reports:
 *   - keys used in code but missing from any en/<area>.json  → ERRORS
 *   - entries in en/*.json that no source file references     → warnings
 *
 * Usage: node scripts/check-i18n.mjs [--lang en|ar]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname, sep as pathSep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src');
const localesDir = join(root, 'src', 'i18n', 'locales');

const langArgIndex = process.argv.indexOf('--lang');
const lang = langArgIndex > -1 ? process.argv[langArgIndex + 1] : 'en';
if (lang !== 'en' && lang !== 'ar') {
  console.error('Expected --lang en or --lang ar');
  process.exit(2);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

// t('key') / t("key") / i18n.t(`key`) — literal keys only (dynamic keys built
// from constants such as t(ROLE_LABELS[x]) are resolved at runtime and are
// covered by the constants' own entries).
const T_CALL = /(?<![\w$.])t\(\s*(['"])((?:[^\\'"\n]|\\.)*)\1/g;
// Any single-line string literal (', " or `) containing Arabic: every one of
// them is user-visible copy and therefore needs an en/<area>.json entry.
const ARABIC_LITERAL = /(['"`])((?:[^\\'"`\n]|\\.)*)\1/g;
const ARABIC = /[\u0600-\u06FF]/;

const used = new Map(); // key -> Set(files)
for (const file of walk(srcDir)) {
  const rel = relative(root, file);
  // Locale files are the declarations themselves; tests are not user-facing.
  if (rel.includes(`i18n${pathSep}locales`) || /\.test\.(ts|tsx)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(T_CALL)) {
    const key = match[2].replace(/\\(['"])/g, '$1');
    if (!used.has(key)) used.set(key, new Set());
    used.get(key).add(rel);
  }
  for (const match of text.matchAll(ARABIC_LITERAL)) {
    const key = match[2];
    if (!ARABIC.test(key)) continue;
    if (!used.has(key)) used.set(key, new Set());
    used.get(key).add(rel);
  }
}

const declared = new Map(); // key -> file
const localeFiles = readdirSync(join(localesDir, lang))
  .filter((f) => f.endsWith('.json'))
  .sort();
for (const file of localeFiles) {
  const data = JSON.parse(readFileSync(join(localesDir, lang, file), 'utf8'));
  for (const key of Object.keys(data)) {
    if (declared.has(key)) {
      console.warn(`WARN  duplicate key across locale files: ${key} (${declared.get(key)} + ${file})`);
    }
    declared.set(key, file);
  }
}

const missing = [...used.keys()].filter((k) => !declared.has(k)).sort();
const unused = [...declared.keys()].filter((k) => !used.has(k)).sort();
// Template literals with ${…} evaluate before t() ever sees them, so they can
// never be a static key — they must become t('… {{var}} …', { var }) instead.
const templated = missing.filter((k) => k.includes('${'));
const plainMissing = missing.filter((k) => !k.includes('${'));

console.log(`lang=${lang}`);
console.log(`literal keys used in src: ${used.size}`);
console.log(`keys declared in ${lang}/*.json: ${declared.size}`);
console.log(`missing translations: ${plainMissing.length}`);
for (const key of plainMissing) {
  const files = [...used.get(key)].slice(0, 3).join(', ');
  console.log(`  MISS  ${JSON.stringify(key)}   ← ${files}`);
}
console.log(`template keys needing {{var}} refactor: ${templated.length}`);
for (const key of templated) {
  const files = [...used.get(key)].slice(0, 3).join(', ');
  console.log(`  TMPL  ${JSON.stringify(key)}   ← ${files}`);
}
console.log(`unused entries: ${unused.length}`);
for (const key of unused) {
  console.log(`  extra ${JSON.stringify(key)}   (${declared.get(key)})`);
}

process.exit(missing.length > 0 ? 1 : 0);
