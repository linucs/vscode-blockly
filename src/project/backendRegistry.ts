import * as vscode from 'vscode';
import { ProjectBackend } from './projectBackend';
import { ProjectConfigType } from './projectConfig';
import { platformioBackend } from './pio/backend';
import { arduinoBackend } from './arduino/backend';

/**
 * Registry of toolchain backends (axis 3). Adding a backend = a new
 * `ProjectBackend` implementation + one entry here. Order matters for the
 * disambiguation prompt's wording (file names are listed in this order).
 */
const BACKENDS: ProjectBackend[] = [platformioBackend, arduinoBackend];

export function getBackend(configType: ProjectConfigType): ProjectBackend | undefined {
    return BACKENDS.find(b => b.configType === configType);
}

/**
 * Detect which backend drives the editor for a source file. Runs every
 * backend's `find()`; if exactly one matches it wins, if several match the user
 * picks (reproducing the legacy platformio.ini-vs-sketch.yaml quick-pick), and
 * if none match returns undefined.
 */
export async function selectBackend(documentFsPath: string): Promise<ProjectBackend | undefined> {
    const found = await Promise.all(
        BACKENDS.map(async b => ({ backend: b, path: await b.find(documentFsPath) })),
    );
    const present = found.filter((f): f is { backend: ProjectBackend; path: string } => Boolean(f.path));

    if (present.length === 0) return undefined;
    if (present.length === 1) return present[0].backend;

    const choice = await vscode.window.showQuickPick(
        present.map(p => ({
            label: p.backend.label,
            description: p.backend.fileLabel,
            detail: p.path,
            backend: p.backend,
        })),
        {
            placeHolder: `Both ${present.map(p => p.backend.fileLabel).join(' and ')} found. Which should drive the block editor?`,
            ignoreFocusOut: true,
        },
    );
    return choice?.backend;
}
