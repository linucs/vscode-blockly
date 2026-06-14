import { PipDependency, BrickDependency } from '../../catalog/CatalogTypes';

/**
 * Add-only dependency merges for the Arduino App Lab backend.
 *
 * Two writers, two files:
 *   - pip deps   → `python/requirements.txt` (one package per line, pip format)
 *   - brick deps → `app.yaml` `bricks:` list (Docker-provisioned bricks)
 *
 * Both are add-only: existing entries are never removed or reordered, and
 * duplicates are skipped (de-duped by package / brick id). Library deps are not
 * handled here — they go to the embedded `sketch/sketch.yaml` via the Arduino
 * backend's `mergeSketchLibraries`.
 */

function detectEol(content: string): string {
    return content.includes('\r\n') ? '\r\n' : '\n';
}

// ── requirements.txt (pip) ───────────────────────────────────────────────────

/** Package identity from a requirements line: strip version/extras/markers, lowercase. */
function pipIdentity(line: string): string {
    const s = line.trim();
    if (!s || s.startsWith('#')) return '';
    // Split on the first version specifier / extras / marker delimiter.
    const name = s.split(/[\s<>=!~;[]/)[0];
    return name.trim().toLowerCase();
}

function pipFromDep(dep: PipDependency): string {
    return dep.minVersion ? `${dep.name}>=${dep.minVersion}` : dep.name;
}

/**
 * Append missing pip dependencies to a requirements.txt body. De-duped by
 * package name (case-insensitive); existing lines and formatting are preserved.
 */
export function mergeRequirementsTxt(
    content: string,
    pip: PipDependency[],
): { content: string; changed: boolean } {
    if (pip.length === 0) return { content, changed: false };

    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const existing = new Set(
        content.split(/\r?\n/).map(pipIdentity).filter(Boolean),
    );

    const missing = pip
        .filter(dep => !existing.has(dep.name.trim().toLowerCase()))
        .map(pipFromDep);
    if (missing.length === 0) return { content, changed: false };

    const base = content.length === 0
        ? ''
        : content.replace(/\r?\n*$/, '') + eol;
    return { content: base + missing.join(eol) + eol, changed: true };
}

// ── app.yaml (bricks) ────────────────────────────────────────────────────────

function indentOf(line: string): number {
    const match = /^(\s*)/.exec(line);
    return match ? match[1].length : 0;
}

/** Brick id from a `- <id>` / `- <id>:` list item, lowercased. */
function brickIdentity(listItem: string): string {
    let s = listItem.trim();
    if (s.startsWith('- ')) s = s.slice(2).trim();
    if (s.endsWith(':')) s = s.slice(0, -1).trim();
    return s.toLowerCase();
}

function formatBrick(dep: BrickDependency): string[] {
    const lines = [`  - ${dep.name}${dep.variables ? ':' : ''}`];
    if (dep.variables && Object.keys(dep.variables).length > 0) {
        lines.push('      variables:');
        for (const [k, v] of Object.entries(dep.variables)) {
            lines.push(`        ${k}: ${v}`);
        }
    }
    return lines;
}

/**
 * Append missing bricks to an app.yaml `bricks:` list. De-duped by brick id;
 * existing entries are preserved. Creates the `bricks:` key at the end of the
 * document if it doesn't exist yet.
 */
export function mergeAppYamlBricks(
    content: string,
    bricks: BrickDependency[],
): { content: string; changed: boolean } {
    if (bricks.length === 0) return { content, changed: false };

    const eol = detectEol(content);
    const lines = content.split(/\r?\n/);

    // Locate the top-level `bricks:` key.
    let bricksIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (/^bricks:\s*$/.test(lines[i])) { bricksIdx = i; break; }
    }

    // Collect existing brick ids and the extent of the list.
    const existing = new Set<string>();
    let listEnd = bricksIdx === -1 ? -1 : bricksIdx + 1;
    if (bricksIdx !== -1) {
        for (let i = bricksIdx + 1; i < lines.length; i++) {
            if (lines[i].trim() === '') { listEnd = i + 1; continue; }
            // A list item or a deeper-indented continuation belongs to the block.
            if (/^\s*-\s+/.test(lines[i]) || indentOf(lines[i]) > 0) {
                if (/^\s*-\s+/.test(lines[i])) existing.add(brickIdentity(lines[i]));
                listEnd = i + 1;
            } else {
                break; // next top-level key
            }
        }
    }

    const missing = bricks.filter(b => !existing.has(b.name.trim().toLowerCase()));
    if (missing.length === 0) return { content, changed: false };

    const newLines = missing.flatMap(formatBrick);

    if (bricksIdx === -1) {
        const base = content.replace(/\r?\n*$/, '');
        const prefix = base.length ? base + eol + eol : '';
        return { content: prefix + 'bricks:' + eol + newLines.join(eol) + eol, changed: true };
    }

    lines.splice(listEnd, 0, ...newLines);
    return { content: lines.join(eol), changed: true };
}
