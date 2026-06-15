import * as assert from 'assert';
import * as vscode from 'vscode';
import { languageForFile, languageForExtension } from '../codegen/sourceLanguage';
import { companionUriFor } from '../sidecar/companion';

suite('sourceLanguage', () => {
    test('maps C++ family extensions to cpp', () => {
        assert.strictEqual(languageForFile('main.cpp'), 'cpp');
        assert.strictEqual(languageForFile('sketch.ino'), 'cpp');
        assert.strictEqual(languageForFile('foo.pde'), 'cpp');
    });

    test('maps .py to python', () => {
        assert.strictEqual(languageForFile('main.py'), 'python');
    });

    test('is case-insensitive', () => {
        assert.strictEqual(languageForExtension('.CPP'), 'cpp');
        assert.strictEqual(languageForFile('MAIN.INO'), 'cpp');
    });

    test('returns undefined for unknown extensions', () => {
        assert.strictEqual(languageForFile('readme.txt'), undefined);
        assert.strictEqual(languageForFile('noext'), undefined);
    });
});

suite('companion file', () => {
    test('derives <basename>.blk next to the source file', () => {
        const src = vscode.Uri.file('/proj/src/main.cpp');
        assert.strictEqual(companionUriFor(src).fsPath, '/proj/src/main.blk');
    });

    test('preserves the folder and replaces only the extension', () => {
        assert.strictEqual(
            companionUriFor(vscode.Uri.file('/a/b/sketch.ino')).fsPath,
            '/a/b/sketch.blk'
        );
    });
});
