import * as vscode from 'vscode';
import * as path from 'path';
import { SIDECAR_EXT } from '../codegen/sourceLanguage';

/**
 * The blocks editor opens directly on a source file (e.g. main.cpp); the Blockly
 * workspace is persisted in a companion file alongside it (main.blk). The
 * source file holds generated code; the companion holds the editable block state.
 */

/** Companion `.blk` URI for a given source file (same folder, same basename). */
export function companionUriFor(source: vscode.Uri): vscode.Uri {
    const dir = path.dirname(source.fsPath);
    const base = path.parse(source.fsPath).name;
    return vscode.Uri.file(path.join(dir, base + SIDECAR_EXT));
}

/**
 * Read the stored Blockly workspace, or undefined if there is none yet.
 * Accepts both the raw-workspace form and a `{ workspace }` wrapper.
 */
export async function readCompanionWorkspace(companion: vscode.Uri): Promise<unknown | undefined> {
    let text: string;
    try {
        text = Buffer.from(await vscode.workspace.fs.readFile(companion)).toString('utf8');
    } catch {
        return undefined;
    }
    if (!text.trim()) {return undefined;}
    try {
        const data = JSON.parse(text);
        if (data && typeof data === 'object' && 'workspace' in data) {
            return (data as { workspace: unknown }).workspace;
        }
        return data;
    } catch {
        return undefined;
    }
}

export async function writeCompanionWorkspace(companion: vscode.Uri, workspace: unknown): Promise<void> {
    const text = JSON.stringify(workspace ?? {}, null, 2);
    await vscode.workspace.fs.writeFile(companion, Buffer.from(text, 'utf8'));
}

export async function companionExists(companion: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(companion);
        return true;
    } catch {
        return false;
    }
}
