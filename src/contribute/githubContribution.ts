import * as vscode from 'vscode';

/** Parsed `owner/repo` slug. */
export interface RepoSlug {
    owner: string;
    repo: string;
}

export interface ContributionInput {
    /** Target repo (upstream) the PR is opened against. */
    upstream: RepoSlug;
    /** Repo-relative path to write, e.g. `catalogs/modulino/thermo.yaml`. */
    repoPath: string;
    /** Raw YAML file contents. */
    content: string;
    /** Catalog id, for branch name and PR title. */
    id: string;
    /** Pre-rendered PR body (author, consent, metadata). */
    prBody: string;
    /** True when overwriting an existing file (affects the PR title verb). */
    isUpdate: boolean;
}

export interface ContributionResult {
    prUrl: string;
}

const API = 'https://api.github.com';

/**
 * Fork the upstream repo to the signed-in user (idempotent), commit the catalog
 * to a fresh branch, and open a pull request back to upstream. Uses VS Code's
 * native GitHub authentication — no PAT, no manual fork. Progress is reported
 * through the supplied progress sink.
 */
export async function contributeViaPullRequest(
    input: ContributionInput,
    progress: vscode.Progress<{ message?: string }>
): Promise<ContributionResult> {
    const session = await vscode.authentication.getSession('github', ['public_repo'], { createIfNone: true });
    const token = session.accessToken;

    const me = await gh<{ login: string }>(token, 'GET', `/user`);
    const login = me.login;
    const { owner, repo } = input.upstream;

    progress.report({ message: vscode.l10n.t('Forking repository…') });
    await ensureFork(token, input.upstream, login);

    // The fork's default branch tracks upstream's; read upstream's to be safe.
    const upstreamInfo = await gh<{ default_branch: string }>(token, 'GET', `/repos/${owner}/${repo}`);
    const baseBranch = upstreamInfo.default_branch;
    const baseRef = await gh<{ object: { sha: string } }>(
        token, 'GET', `/repos/${login}/${repo}/git/ref/heads/${baseBranch}`
    );
    const baseSha = baseRef.object.sha;

    const branch = `contribute/${slugify(input.id)}-${shortStamp()}`;
    await gh(token, 'POST', `/repos/${login}/${repo}/git/refs`, {
        ref: `refs/heads/${branch}`,
        sha: baseSha,
    });

    progress.report({ message: vscode.l10n.t('Committing catalog…') });
    const existingSha = await getFileSha(token, login, repo, input.repoPath, branch);
    await gh(token, 'PUT', `/repos/${login}/${repo}/contents/${encodePath(input.repoPath)}`, {
        message: `${input.isUpdate ? 'Update' : 'Add'} catalog: ${input.id}`,
        content: Buffer.from(input.content, 'utf-8').toString('base64'),
        branch,
        ...(existingSha ? { sha: existingSha } : {}),
    });

    progress.report({ message: vscode.l10n.t('Opening pull request…') });
    const pr = await gh<{ html_url: string }>(token, 'POST', `/repos/${owner}/${repo}/pulls`, {
        title: `${input.isUpdate ? 'Update' : 'Add'} catalog: ${input.id}`,
        head: `${login}:${branch}`,
        base: baseBranch,
        body: input.prBody,
        maintainer_can_modify: true,
    });

    return { prUrl: pr.html_url };
}

/** Create the fork if absent and wait until the GitHub API reports it ready. */
async function ensureFork(token: string, upstream: RepoSlug, login: string): Promise<void> {
    // POST /forks is idempotent — it returns the existing fork if present.
    await gh(token, 'POST', `/repos/${upstream.owner}/${upstream.repo}/forks`);

    for (let attempt = 0; attempt < 20; attempt++) {
        try {
            await gh(token, 'GET', `/repos/${login}/${upstream.repo}`);
            return;
        } catch (err) {
            if (httpStatus(err) === 404) {
                await delay(1500);
                continue;
            }
            throw err;
        }
    }
    throw new Error(vscode.l10n.t('Timed out waiting for the fork to be ready. Please try again.'));
}

async function getFileSha(
    token: string, login: string, repo: string, repoPath: string, branch: string
): Promise<string | undefined> {
    try {
        const file = await gh<{ sha: string }>(
            token, 'GET', `/repos/${login}/${repo}/contents/${encodePath(repoPath)}?ref=${branch}`
        );
        return file.sha;
    } catch (err) {
        if (httpStatus(err) === 404) {return undefined;}
        throw err;
    }
}

class GitHubApiError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
    }
}

async function gh<T = unknown>(
    token: string,
    method: string,
    pathname: string,
    body?: unknown
): Promise<T> {
    const res = await fetch(`${API}${pathname}`, {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'PlatformIO-Blocks-VSCode',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        let detail = '';
        try {
            const json = await res.json() as { message?: string };
            detail = json?.message ? `: ${json.message}` : '';
        } catch { /* non-JSON body */ }
        throw new GitHubApiError(`GitHub API ${res.status} on ${method} ${pathname}${detail}`, res.status);
    }

    if (res.status === 204) {return undefined as T;}
    return await res.json() as T;
}

function httpStatus(err: unknown): number | undefined {
    return err instanceof GitHubApiError ? err.status : undefined;
}

/** Parse an `owner/repo` slug, tolerating a full GitHub URL or trailing `.git`. */
export function parseRepoSlug(value: string): RepoSlug {
    const cleaned = value.trim()
        .replace(/^https?:\/\/github\.com\//i, '')
        .replace(/\.git$/i, '');
    const [owner, repo] = cleaned.split('/');
    if (!owner || !repo) {
        throw new Error(vscode.l10n.t('Invalid contribution repository "{0}". Expected "owner/repo".', value));
    }
    return { owner, repo };
}

function encodePath(repoPath: string): string {
    return repoPath.split('/').map(encodeURIComponent).join('/');
}

function slugify(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'catalog';
}

/** Short, sortable, collision-resistant suffix for branch names (no Date.now ban here — host code). */
function shortStamp(): string {
    return Date.now().toString(36);
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
