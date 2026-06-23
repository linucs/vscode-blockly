import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectBackend } from './projectBackend';
import { ProjectConfigType } from './projectConfig';
import { platformioBackend } from './pio/backend';
import { arduinoBackend } from './arduino/backend';
import { appLabBackend } from './applab/backend';

/**
 * Registry of toolchain backends (axis 3). Adding a backend = a new
 * `ProjectBackend` implementation + one entry here. Order matters for the
 * disambiguation prompt's wording (file names are listed in this order).
 */
const BACKENDS: ProjectBackend[] = [platformioBackend, arduinoBackend, appLabBackend];

export function getBackend(configType: ProjectConfigType): ProjectBackend | undefined {
    return BACKENDS.find(b => b.configType === configType);
}

/**
 * Detect which backend drives the editor for a source file. Runs every
 * backend's `find()`; if none match returns undefined.
 *
 * When several backends match (their config files all sit on the path from the
 * source file up to the filesystem root), the **nearest** config wins — the one
 * whose path is deepest, i.e. the closest ancestor of the opened file. This lets
 * an Arduino App Lab project (top-level `app.yaml`, with `sketch/sketch.yaml`
 * nested under it) resolve correctly: opening `python/main.py` matches only
 * `app.yaml`, while opening `sketch/sketch.ino` picks the deeper `sketch.yaml`
 * over the ancestor `app.yaml` without prompting. A genuine depth tie (e.g.
 * platformio.ini and sketch.yaml in the same directory) still falls back to the
 * disambiguation quick-pick.
 */
export async function selectBackend(documentFsPath: string): Promise<ProjectBackend | undefined> {
    const found = await Promise.all(
        BACKENDS.map(async b => ({ backend: b, path: await b.find(documentFsPath) })),
    );
    const present = found.filter((f): f is { backend: ProjectBackend; path: string } => Boolean(f.path));

    if (present.length === 0) {return undefined;}
    if (present.length === 1) {return present[0].backend;}

    // Nearest config wins: keep only the deepest matches (most path segments).
    const depth = (p: string) => p.split(path.sep).length;
    const maxDepth = Math.max(...present.map(p => depth(p.path)));
    const deepest = present.filter(p => depth(p.path) === maxDepth);
    if (deepest.length === 1) {return deepest[0].backend;}

    const choice = await vscode.window.showQuickPick(
        deepest.map(p => ({
            label: p.backend.label,
            description: p.backend.fileLabel,
            detail: p.path,
            backend: p.backend,
        })),
        {
            placeHolder: `Both ${deepest.map(p => p.backend.fileLabel).join(' and ')} found. Which should drive the block editor?`,
            ignoreFocusOut: true,
        },
    );
    return choice?.backend;
}
