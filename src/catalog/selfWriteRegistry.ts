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
 * Whether `fsPath` was written by us within the window. Consumes the marker on a
 * match so a later genuine external edit isn't masked by a stale entry.
 */
export function consumeSelfWrite(fsPath: string, windowMs: number = DEFAULT_WINDOW_MS, now: number = Date.now()): boolean {
    const at = recent.get(fsPath);
    if (at === undefined) return false;
    recent.delete(fsPath);
    return now - at <= windowMs;
}
