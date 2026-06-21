import * as yaml from 'js-yaml';

/**
 * Semantic comparison for the round-trip guarantee (design: round-trip is
 * **semantic**, not byte — `js-yaml.dump` cannot reproduce hand-authored styling).
 * Two catalog YAML strings are "the same" when their parsed data is deep-equal;
 * object key order and YAML styling (quoting, flow vs block) are irrelevant, but
 * array order is significant (it carries meaning: arg order, code-line order).
 *
 * Used by the import-time self-check (mismatch → fallback to text) and the
 * full-corpus round-trip test. Pure and vscode-free.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) {
        return true;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
            return false;
        }
        return a.every((v, i) => deepEqual(v, b[i]));
    }
    if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
        const ao = a as Record<string, unknown>;
        const bo = b as Record<string, unknown>;
        const ak = Object.keys(ao);
        const bk = Object.keys(bo);
        if (ak.length !== bk.length) {
            return false;
        }
        return ak.every(k => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]));
    }
    return false;
}

/** True when two catalog YAML documents parse to deep-equal data (semantic round-trip). */
export function semanticallyEqualYaml(a: string, b: string): boolean {
    try {
        return deepEqual(yaml.load(a), yaml.load(b));
    } catch {
        return false;
    }
}

/**
 * The first differing path between two parsed values, as a short diagnostic
 * (e.g. `.implementations[0].blocks: missing`). `null` when deep-equal. Used by
 * the import-time self-check to name *what* didn't round-trip before falling back.
 */
export function firstDiff(a: unknown, b: unknown, path = ''): string | null {
    if (deepEqual(a, b)) {
        return null;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
            return `${path}: length ${a.length} vs ${b.length}`;
        }
        for (let i = 0; i < a.length; i++) {
            const d = firstDiff(a[i], b[i], `${path}[${i}]`);
            if (d) {
                return d;
            }
        }
        return `${path}: arrays differ`;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
        const ao = a as Record<string, unknown>;
        const bo = b as Record<string, unknown>;
        for (const key of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
            if (!(key in ao)) {
                return `${path}.${key}: only in produced`;
            }
            if (!(key in bo)) {
                return `${path}.${key}: missing in produced`;
            }
            const d = firstDiff(ao[key], bo[key], `${path}.${key}`);
            if (d) {
                return d;
            }
        }
        return `${path}: objects differ`;
    }
    return `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
}

/** Parse two YAML strings and report the first differing path (`null` if equal). */
export function firstDiffYaml(a: string, b: string): string | null {
    try {
        return firstDiff(yaml.load(a), yaml.load(b));
    } catch (err) {
        return `parse error: ${(err as Error).message}`;
    }
}
