/**
 * Pure helper for the CustomTextEditor re-entrancy guard (vscode-free, testable).
 *
 * The guided catalog editor writes the document itself (a `WorkspaceEdit` built
 * from the block workspace). That write fires `onDidChangeTextDocument`, which must
 * NOT be mistaken for an external edit — otherwise the editor would re-import its
 * own output and loop. We track the last text we wrote and treat a document change
 * as *external* only when its text differs from that. Line endings are normalised so
 * an EOL-only difference (CRLF file vs the serializer's LF) doesn't look external.
 */

function normalizeEol(text: string): string {
    return text.replace(/\r\n/g, '\n');
}

/** True when `docText` differs from what we last wrote — i.e. a genuine external edit. */
export function isExternalChange(docText: string, lastSyncedText: string | undefined): boolean {
    if (lastSyncedText === undefined) {
        return true;
    }
    return normalizeEol(docText) !== normalizeEol(lastSyncedText);
}
