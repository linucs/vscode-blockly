/**
 * Non-destructive merge of lib_deps into a specific [env:NAME] section of a
 * platformio.ini. Add-only: never removes user entries, only the targeted env
 * is touched, and duplicates are skipped (lib_deps de-duped by library name so
 * user-pinned versions are preserved).
 *
 * The targeted key is rewritten in normalized multi-line form; everything else
 * in the file is left byte-for-byte intact.
 */

interface KeySpec {
    /** Split a raw value (one line's worth) into tokens. */
    tokenize(value: string): string[];
    /** Identity used to detect duplicates. */
    dedupKey(token: string): string;
}

const LIB_SPEC: KeySpec = {
    tokenize: v => v.split(',').map(t => t.trim()).filter(Boolean),
    // Dedup by library identity. For the `name=url#ref` VCS form, the identity
    // is the custom name before `=` (so changing the pinned ref doesn't add a
    // duplicate). Otherwise it's the registry name before any `@version`.
    dedupKey: t => {
        const eq = t.indexOf('=');
        const id = eq !== -1 ? t.slice(0, eq) : t.split('@')[0];
        return id.trim().toLowerCase();
    },
};

function detectEol(content: string): string {
    return content.includes('\r\n') ? '\r\n' : '\n';
}

function findEnvRange(lines: string[], envName: string): { start: number; end: number } | undefined {
    const header = `[env:${envName}]`;
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === header) { start = i; break; }
    }
    if (start === -1) return undefined;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (/^\s*\[.+\]\s*$/.test(lines[i])) { end = i; break; }
    }
    return { start, end };
}

function mergeKey(
    lines: string[],
    range: { start: number; end: number },
    key: string,
    additions: string[],
    spec: KeySpec
): { lines: string[]; changed: boolean } {
    if (additions.length === 0) return { lines, changed: false };

    const keyRe = new RegExp(`^\\s*${key}\\s*=`);
    let keyIdx = -1;
    for (let i = range.start + 1; i < range.end; i++) {
        if (keyRe.test(lines[i])) { keyIdx = i; break; }
    }

    const existing: string[] = [];
    let blockStart = -1;
    let blockEnd = -1;
    if (keyIdx !== -1) {
        const inline = lines[keyIdx].slice(lines[keyIdx].indexOf('=') + 1);
        existing.push(...spec.tokenize(inline));
        blockStart = keyIdx;
        blockEnd = keyIdx + 1;
        // Continuation lines: indented, non-section, until the next key/blank.
        for (let i = keyIdx + 1; i < range.end; i++) {
            if (/^\s+\S/.test(lines[i]) && !/^\s*\[/.test(lines[i])) {
                existing.push(...spec.tokenize(lines[i]));
                blockEnd = i + 1;
            } else break;
        }
    }

    const seen = new Set(existing.map(spec.dedupKey));
    const missing = additions.filter(a => !seen.has(spec.dedupKey(a)));
    if (missing.length === 0) return { lines, changed: false };

    const merged = [...existing, ...missing];
    const block = [`${key} =`, ...merged.map(t => `    ${t}`)];

    const newLines = keyIdx !== -1
        ? [...lines.slice(0, blockStart), ...block, ...lines.slice(blockEnd)]
        : [...lines.slice(0, range.end), ...block, ...lines.slice(range.end)];

    return { lines: newLines, changed: true };
}

export function mergeEnvLists(
    content: string,
    envName: string,
    additions: { libDeps?: string[] }
): { content: string; changed: boolean } {
    const eol = detectEol(content);
    let lines = content.split(/\r?\n/);

    if (!findEnvRange(lines, envName)) {
        return { content, changed: false }; // env not present — don't invent it
    }

    let changed = false;
    const apply = (key: string, adds: string[] | undefined, spec: KeySpec) => {
        const range = findEnvRange(lines, envName)!; // re-locate (indices shift)
        const r = mergeKey(lines, range, key, adds ?? [], spec);
        lines = r.lines;
        if (r.changed) changed = true;
    };

    apply('lib_deps', additions.libDeps, LIB_SPEC);

    return { content: lines.join(eol), changed };
}
