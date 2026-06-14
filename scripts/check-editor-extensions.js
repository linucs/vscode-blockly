#!/usr/bin/env node
/**
 * check-editor-extensions.js — drift guard for the blocks-editor file-extension set.
 *
 * The set of source extensions the blocks editor handles is declared in THREE
 * independent places that must agree exactly:
 *
 *   1. package.json  > contributes.customEditors[blocks-editor.editor].selector
 *                      (the "*.ext" globs that make the custom editor offerable)
 *   2. package.json  > contributes.menus["explorer/context" | "editor/title/context"]
 *                      for command "blocks-editor.openInBlocksEditor"
 *                      (the `resourceExtname == .ext` tokens in the `when` clauses)
 *   3. src/codegen/sourceLanguage.ts > SOURCE_LANGUAGE_BY_EXT
 *                      (the extension -> codegen language map)
 *
 * If these drift apart you get silent misbehaviour: a selector glob with no
 * language mapping falls through to the 'cpp' default; a mapping with no glob is
 * unreachable; a menu entry that lists the wrong extensions offers the command on
 * files the editor can't handle (or hides it on files it can).
 *
 * This check normalizes all three to a set of lowercase extensions ('.ino', …)
 * and asserts they are identical.
 *
 * Exit code: 0 if all three sets match, 1 otherwise.
 *
 * Usage: node scripts/check-editor-extensions.js   (or: yarn check-editor-ext)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const errors = [];
const err = (m) => errors.push(m);

const setsEqual = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const fmt = (s) => (s.size ? [...s].sort().join(', ') : '(none)');

// --- 1. customEditors selector globs ("*.ino" -> ".ino") ---------------------
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const editor = (pkg.contributes?.customEditors ?? []).find(
    (e) => e.viewType === 'blocks-editor.editor',
);
if (!editor) {
    err('package.json: customEditor "blocks-editor.editor" not found.');
}
const selectorExts = new Set(
    (editor?.selector ?? [])
        .map((s) => s.filenamePattern)
        .filter((p) => typeof p === 'string' && p.startsWith('*.'))
        .map((p) => p.slice(1).toLowerCase()),
);

// --- 2. menu `when` clauses for openInBlocksEditor ---------------------------
//     tokens look like: resourceExtname == .ino
const menus = pkg.contributes?.menus ?? {};
const MENU_LOCATIONS = ['explorer/context', 'editor/title/context'];
const extnameToken = /resourceExtname\s*==\s*(\.[A-Za-z0-9]+)/g;
for (const loc of MENU_LOCATIONS) {
    const entries = (menus[loc] ?? []).filter(
        (m) => m.command === 'blocks-editor.openInBlocksEditor',
    );
    if (entries.length === 0) {
        err(`package.json: menus["${loc}"] has no "blocks-editor.openInBlocksEditor" entry.`);
        continue;
    }
    for (const entry of entries) {
        const when = entry.when ?? '';
        const found = new Set();
        let m;
        while ((m = extnameToken.exec(when)) !== null) {
            found.add(m[1].toLowerCase());
        }
        if (!setsEqual(found, selectorExts)) {
            err(
                `package.json: menus["${loc}"] when-clause extensions [${fmt(found)}] ` +
                    `do not match customEditors selector [${fmt(selectorExts)}].`,
            );
        }
    }
}

// --- 3. SOURCE_LANGUAGE_BY_EXT keys -----------------------------------------
const srcLang = fs.readFileSync(
    path.join(ROOT, 'src', 'codegen', 'sourceLanguage.ts'),
    'utf8',
);
const objMatch = srcLang.match(/SOURCE_LANGUAGE_BY_EXT[^=]*=\s*{([^}]*)}/s);
if (!objMatch) {
    err('src/codegen/sourceLanguage.ts: could not locate SOURCE_LANGUAGE_BY_EXT object literal.');
}
const mapExts = new Set();
if (objMatch) {
    const keyRe = /['"](\.[A-Za-z0-9]+)['"]\s*:/g;
    let m;
    while ((m = keyRe.exec(objMatch[1])) !== null) {
        mapExts.add(m[1].toLowerCase());
    }
}

// --- compare selector vs map ------------------------------------------------
if (!setsEqual(selectorExts, mapExts)) {
    const onlySelector = new Set([...selectorExts].filter((x) => !mapExts.has(x)));
    const onlyMap = new Set([...mapExts].filter((x) => !selectorExts.has(x)));
    err(
        'Extension sets differ between package.json customEditors selector and ' +
            'SOURCE_LANGUAGE_BY_EXT.',
    );
    if (onlySelector.size) {
        err(`  In selector but not mapped (would default to 'cpp'): ${fmt(onlySelector)}`);
    }
    if (onlyMap.size) {
        err(`  Mapped but not in selector (unreachable): ${fmt(onlyMap)}`);
    }
}

// --- report -----------------------------------------------------------------
if (errors.length) {
    console.error('check-editor-extensions: FAIL');
    for (const e of errors) {
        console.error('  ✖ ' + e);
    }
    process.exit(1);
}
console.log(`check-editor-extensions: OK (${fmt(selectorExts)})`);
