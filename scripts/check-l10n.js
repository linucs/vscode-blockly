#!/usr/bin/env node
/**
 * check-l10n.js — systematic translation completeness & formal-correctness check.
 *
 * Verifies every l10n domain that has machine-checkable key sets:
 *   1. Manifest        — package.nls.json            + package.nls.<locale>.json   ({n} placeholders)
 *   2. Custom blocks   — l10n/blocks.en.json         + l10n/blocks.<locale>.json   (%n placeholders)
 *   3. Extension host  — l10n/bundle.l10n.<locale>.json   (no English base; English IS the l10n.t() literal in src/)
 *   4. YAML catalogs   — inline en:/<locale>: objects on message<n>/tooltip fields  (%n placeholders)
 *
 * For each locale file it checks:
 *   - the file is valid JSON / YAML,
 *   - it has exactly the reference key set (reports MISSING and STALE keys),
 *   - every value is a non-empty string,
 *   - placeholder tokens ({0}/{1}… or %1/%2…) match the reference exactly.
 *
 * The set of supported locales is derived from the files on disk (union across the
 * three JSON families), so adding a new locale automatically expands every check.
 *
 * Exit code: 0 if everything passes, 1 if any ERROR is found. WARNINGs do not fail.
 *
 * Usage: node scripts/check-l10n.js   (or: yarn check-l10n)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function readJson(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw); // throws on invalid JSON — caller wraps
}

function walk(dir, predicate, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === '.git') continue;
      walk(full, predicate, out);
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

// Tokens of the form {0},{1},… (VS Code / vscode.l10n style)
function bracePlaceholders(s) {
  return new Set((s.match(/\{\d+\}/g) || []).sort());
}
// Tokens of the form %1,%2,… (Blockly message style)
function percentPlaceholders(s) {
  return new Set((s.match(/%\d+/g) || []).sort());
}
function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
function rel(file) {
  return path.relative(ROOT, file);
}

// Validate one value against a reference value (placeholder parity + non-empty string).
function checkValue(label, locale, key, value, refValue, placeholderFn) {
  if (typeof value !== 'string') {
    err(`[${label}] ${locale}: key "${key}" is not a string (got ${typeof value})`);
    return;
  }
  if (value.trim() === '') {
    err(`[${label}] ${locale}: key "${key}" is empty`);
    return;
  }
  if (refValue != null) {
    const refPh = placeholderFn(refValue);
    const valPh = placeholderFn(value);
    if (!setsEqual(refPh, valPh)) {
      err(
        `[${label}] ${locale}: key "${key}" placeholder mismatch — ` +
          `reference {${[...refPh].join(',')}} vs translation {${[...valPh].join(',')}}`,
      );
    }
  }
}

/**
 * Compare a locale object against a reference key set, reporting missing/stale keys
 * and validating every shared value.
 */
function checkKeySet(label, locale, obj, refKeys, refValues, placeholderFn) {
  const localeKeys = new Set(Object.keys(obj));
  const missing = [...refKeys].filter((k) => !localeKeys.has(k));
  const stale = [...localeKeys].filter((k) => !refKeys.has(k));
  if (missing.length) {
    err(`[${label}] ${locale}: ${missing.length} missing key(s): ${missing.map((k) => JSON.stringify(k)).join(', ')}`);
  }
  if (stale.length) {
    warn(`[${label}] ${locale}: ${stale.length} stale key(s) not in reference: ${stale.map((k) => JSON.stringify(k)).join(', ')}`);
  }
  for (const k of refKeys) {
    if (localeKeys.has(k)) {
      checkValue(label, locale, k, obj[k], refValues ? refValues[k] : null, placeholderFn);
    }
  }
}

// ---------------------------------------------------------------------------
// discover supported locales (union of locale tokens across the JSON families)
// ---------------------------------------------------------------------------
function localesFrom(re, files) {
  const set = new Set();
  for (const f of files) {
    const m = path.basename(f).match(re);
    if (m) set.add(m[1]);
  }
  return set;
}

const L10N_DIR = path.join(ROOT, 'l10n');
const nlsFiles = fs.readdirSync(ROOT).filter((f) => /^package\.nls\.[\w-]+\.json$/.test(f)).map((f) => path.join(ROOT, f));
const blockFiles = fs.existsSync(L10N_DIR) ? fs.readdirSync(L10N_DIR).filter((f) => /^blocks\.[\w-]+\.json$/.test(f)).map((f) => path.join(L10N_DIR, f)) : [];
const bundleFiles = fs.existsSync(L10N_DIR) ? fs.readdirSync(L10N_DIR).filter((f) => /^bundle\.l10n\.[\w-]+\.json$/.test(f)).map((f) => path.join(L10N_DIR, f)) : [];

const supported = new Set([
  ...localesFrom(/^package\.nls\.([\w-]+)\.json$/, nlsFiles),
  ...localesFrom(/^blocks\.([\w-]+)\.json$/, blockFiles),
  ...localesFrom(/^bundle\.l10n\.([\w-]+)\.json$/, bundleFiles),
]);
supported.delete('en'); // 'en' is the source/base for blocks, not a translation target
const LOCALES = [...supported].sort();

console.log(`Supported locales (${LOCALES.length}): ${LOCALES.join(', ')}\n`);

// ---------------------------------------------------------------------------
// 1. Manifest — package.nls.*
// ---------------------------------------------------------------------------
(function checkManifest() {
  const basePath = path.join(ROOT, 'package.nls.json');
  if (!fs.existsSync(basePath)) {
    err('[manifest] base file package.nls.json is missing');
    return;
  }
  let base;
  try {
    base = readJson(basePath);
  } catch (e) {
    err(`[manifest] package.nls.json is not valid JSON: ${e.message}`);
    return;
  }
  const refKeys = new Set(Object.keys(base));
  for (const locale of LOCALES) {
    const file = path.join(ROOT, `package.nls.${locale}.json`);
    if (!fs.existsSync(file)) {
      err(`[manifest] locale file missing: ${rel(file)}`);
      continue;
    }
    let obj;
    try {
      obj = readJson(file);
    } catch (e) {
      err(`[manifest] ${rel(file)} is not valid JSON: ${e.message}`);
      continue;
    }
    checkKeySet('manifest', locale, obj, refKeys, base, bracePlaceholders);
  }
})();

// ---------------------------------------------------------------------------
// 2. Custom blocks — l10n/blocks.*
// ---------------------------------------------------------------------------
(function checkBlocks() {
  const basePath = path.join(L10N_DIR, 'blocks.en.json');
  if (!fs.existsSync(basePath)) {
    err('[blocks] base file l10n/blocks.en.json is missing');
    return;
  }
  let base;
  try {
    base = readJson(basePath);
  } catch (e) {
    err(`[blocks] l10n/blocks.en.json is not valid JSON: ${e.message}`);
    return;
  }
  const refKeys = new Set(Object.keys(base));
  for (const locale of LOCALES) {
    const file = path.join(L10N_DIR, `blocks.${locale}.json`);
    if (!fs.existsSync(file)) {
      err(`[blocks] locale file missing: ${rel(file)}`);
      continue;
    }
    let obj;
    try {
      obj = readJson(file);
    } catch (e) {
      err(`[blocks] ${rel(file)} is not valid JSON: ${e.message}`);
      continue;
    }
    checkKeySet('blocks', locale, obj, refKeys, base, percentPlaceholders);
  }
})();

// ---------------------------------------------------------------------------
// 3. Extension host — l10n/bundle.l10n.*  (English source = l10n.t() literals)
// ---------------------------------------------------------------------------
(function checkHostBundle() {
  // Collect every static l10n.t('literal', …) message used in src/ and webview/.
  const srcDirs = ['src', 'webview'].map((d) => path.join(ROOT, d)).filter(fs.existsSync);
  const tsFiles = srcDirs.flatMap((d) => walk(d, (f) => /\.(ts|tsx|js|mjs)$/.test(f)));
  const used = new Set();
  const re = /l10n\.t\(\s*([`'"])((?:\\.|(?!\1).)*)\1/g;
  for (const f of tsFiles) {
    const s = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = re.exec(s))) {
      used.add(m[2].replace(/\\(["'`\\])/g, '$1')); // unescape quotes/backslash
    }
  }

  // Reference key set = every used literal ∪ every key present in any bundle.
  const bundles = {};
  for (const locale of LOCALES) {
    const file = path.join(L10N_DIR, `bundle.l10n.${locale}.json`);
    if (!fs.existsSync(file)) {
      err(`[host] locale file missing: ${rel(file)}`);
      bundles[locale] = null;
      continue;
    }
    try {
      bundles[locale] = readJson(file);
    } catch (e) {
      err(`[host] ${rel(file)} is not valid JSON: ${e.message}`);
      bundles[locale] = null;
    }
  }

  const refKeys = new Set(used);
  for (const obj of Object.values(bundles)) {
    if (obj) for (const k of Object.keys(obj)) refKeys.add(k);
  }

  // Flag any l10n.t() literal that no bundle translates at all (English-only string).
  const untranslated = [...used].filter((u) => Object.values(bundles).every((o) => !o || !(u in o)));
  for (const u of untranslated) {
    err(`[host] l10n.t() string has no translation in any bundle: ${JSON.stringify(u)}`);
  }

  // For the host domain the English source is the key itself → use the key as the
  // placeholder reference so {0}/{1} parity is still enforced.
  for (const locale of LOCALES) {
    const obj = bundles[locale];
    if (!obj) continue;
    const refValues = {};
    for (const k of refKeys) refValues[k] = k;
    checkKeySet('host', locale, obj, refKeys, refValues, bracePlaceholders);
  }
})();

// ---------------------------------------------------------------------------
// 4. YAML catalogs — inline en:/<locale>: objects on message<n>/tooltip fields
// ---------------------------------------------------------------------------
(function checkCatalogs() {
  const catalogsDir = path.join(ROOT, 'catalogs');
  if (!fs.existsSync(catalogsDir)) return;
  const files = walk(catalogsDir, (f) => /\.ya?ml$/.test(f));
  const isTranslatable = (k) => /^message\d+$/.test(k) || k === 'tooltip';

  for (const file of files) {
    let docs;
    try {
      docs = yaml.loadAll(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      err(`[catalog] ${rel(file)} is not valid YAML: ${e.message}`);
      continue;
    }
    const visit = (node, fieldPath) => {
      if (Array.isArray(node)) {
        node.forEach((v, i) => visit(v, `${fieldPath}[${i}]`));
        return;
      }
      if (node && typeof node === 'object') {
        for (const k of Object.keys(node)) {
          const v = node[k];
          // A translatable field is localized only when it's an object carrying `en`.
          if (isTranslatable(k) && v && typeof v === 'object' && !Array.isArray(v) && 'en' in v) {
            const enVal = v.en;
            const refPh = k === 'tooltip' ? null : percentPlaceholders(String(enVal));
            for (const locale of LOCALES) {
              if (!(locale in v)) {
                err(`[catalog] ${rel(file)} ${fieldPath}.${k}: missing locale "${locale}"`);
                continue;
              }
              const val = v[locale];
              if (typeof val !== 'string' || val.trim() === '') {
                err(`[catalog] ${rel(file)} ${fieldPath}.${k}: locale "${locale}" is empty or not a string`);
                continue;
              }
              if (refPh && !setsEqual(refPh, percentPlaceholders(val))) {
                err(
                  `[catalog] ${rel(file)} ${fieldPath}.${k}: locale "${locale}" placeholder mismatch — ` +
                    `en {${[...refPh].join(',')}} vs {${[...percentPlaceholders(val)].join(',')}}`,
                );
              }
            }
          } else {
            visit(v, `${fieldPath}.${k}`);
          }
        }
      }
    };
    docs.forEach((doc, i) => doc != null && visit(doc, docs.length > 1 ? `#${i}` : ''));
  }
})();

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------
if (warnings.length) {
  console.log(`⚠️  ${warnings.length} warning(s):`);
  for (const w of warnings) console.log('   ' + w);
  console.log('');
}
if (errors.length) {
  console.log(`❌ ${errors.length} error(s):`);
  for (const e of errors) console.log('   ' + e);
  console.log('\nFAIL — translations are incomplete or malformed.');
  process.exit(1);
} else {
  console.log('✅ All translations present and formally correct.');
  process.exit(0);
}
