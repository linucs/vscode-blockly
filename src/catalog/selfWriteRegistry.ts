/**
 * Tracks files the Guided Catalog Editor has just written, so the panel can tell
 * its *own* saves apart from genuine external edits (Arduino IDE, git, manual
 * text edit) when its file watcher fires.
 *
 * Best-effort, not race-free: a documented residual TOCTOU window is accepted
 * (design §5d). When in doubt the consumer should treat a change as external
 * rather than silently swallow it.
 */

const recent = new Map<string, number>();
const DEFAULT_WINDOW_MS = 1500;

/** Record that we are about to / just did write `fsPath`. */
export function markSelfWrite(fsPath: string, now: number = Date.now()): void {
    recent.set(fsPath, now);
}

/**
 * Whether `fsPath` was written by us within the window. Does NOT delete the
 * marker on a match: a single save can surface as several watcher events
 * (`onDidChange` + `onDidCreate`, or repeated `onDidChange`), and consuming the
 * marker on the first event would let the others read as genuine external edits.
 * The marker instead expires by time — the next `markSelfWrite` (our next save)
 * resets it, and a stale marker older than the window is dropped so a later real
 * external edit isn't masked.
 */
export function consumeSelfWrite(fsPath: string, windowMs: number = DEFAULT_WINDOW_MS, now: number = Date.now()): boolean {
    const at = recent.get(fsPath);
    if (at === undefined) return false;
    const fresh = now - at <= windowMs;
    if (!fresh) {
        recent.delete(fsPath);
    }
    return fresh;
}
