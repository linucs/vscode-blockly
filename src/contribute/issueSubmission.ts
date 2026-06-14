import * as vscode from 'vscode';
import { RepoSlug } from './githubContribution';

export interface IssueSubmissionInput {
    upstream: RepoSlug;
    /** Full destination path, e.g. `catalogs/modulino/thermo.yaml` — used verbatim by the issue→PR workflow. */
    repoPath: string;
    /** First document's id — used only for the issue title. The YAML file is the source of truth. */
    id: string;
    author: string;
    /** Raw YAML file contents (may contain multiple `---`-separated catalog documents). */
    content: string;
}

/**
 * Browsers and GitHub truncate very long prefill URLs. Above this encoded
 * length we drop the YAML from the URL and put it on the clipboard instead.
 */
const MAX_URL_LENGTH = 6000;

/**
 * Open a pre-filled "Block submission" GitHub Issue Form. The query-param keys
 * must match the field `id`s in `.github/ISSUE_TEMPLATE/block-submission.yml`
 * in the community repo. Returns whether the YAML was placed on the clipboard
 * (large-catalog fallback) so the caller can tell the user.
 */
export async function submitViaIssue(input: IssueSubmissionInput): Promise<{ usedClipboard: boolean }> {
    const { owner, repo } = input.upstream;
    const base = `https://github.com/${owner}/${repo}/issues/new`;

    // The YAML file is the source of truth (and may hold multiple documents), so
    // only the destination path and author are prefilled alongside the content —
    // id/category/vendor are read from the YAML downstream, not asked for here.
    const fields: Record<string, string> = {
        template: 'block-submission.yml',
        title: `Add catalog: ${input.id}`,
        dest_path: input.repoPath,
        author: input.author,
    };

    const withYaml = buildUrl(base, { ...fields, catalog_yaml: input.content });
    if (withYaml.length <= MAX_URL_LENGTH) {
        await vscode.env.openExternal(vscode.Uri.parse(withYaml));
        return { usedClipboard: false };
    }

    // Too large to carry in the URL: stage the YAML on the clipboard and leave
    // the textarea empty (its template placeholder tells the user to paste).
    await vscode.env.clipboard.writeText(input.content);
    const withoutYaml = buildUrl(base, fields);
    await vscode.env.openExternal(vscode.Uri.parse(withoutYaml));
    return { usedClipboard: true };
}

function buildUrl(base: string, params: Record<string, string>): string {
    const qs = Object.entries(params)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');
    return `${base}?${qs}`;
}
