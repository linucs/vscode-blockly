import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { validateCatalogYaml } from '../catalog/validateCatalog';
import { httpGet } from '../catalog/remoteCatalog';
import { RegistryIndex } from '../catalog/CatalogRegistryTypes';
import { gatherLocalCatalogs, LocalCatalog } from './localCatalogs';
import { contributeViaPullRequest, parseRepoSlug, RepoSlug } from './githubContribution';
import { submitViaIssue } from './issueSubmission';

const DEFAULT_REPO = 'linucs/blocks-community-catalog';

/**
 * Command `blocks-editor.contributeCatalog`. Walks the user through submitting a
 * locally authored catalog to the community repo, via a pull request (native
 * GitHub auth, auto-fork) or a pre-filled issue form (no fork needed).
 */
export async function contributeCatalog(uri?: vscode.Uri): Promise<void> {
    const config = vscode.workspace.getConfiguration('blocks-editor');
    let upstream: RepoSlug;
    try {
        upstream = parseRepoSlug(config.get('contributionRepo', DEFAULT_REPO));
    } catch (err) {
        vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
        return;
    }

    // 1. Pick the catalog.
    const catalog = await pickCatalog(uri);
    if (!catalog) return;

    // 2. Validate locally — only valid catalogs are submittable.
    let content: string;
    try {
        content = await fs.readFile(catalog.fsPath, 'utf-8');
    } catch (err) {
        vscode.window.showErrorMessage(
            vscode.l10n.t('Could not read "{0}": {1}', catalog.fileName, err instanceof Error ? err.message : String(err))
        );
        return;
    }
    const report = validateCatalogYaml(content);
    if (!report.startsWith('Valid.')) {
        await vscode.window.showErrorMessage(
            vscode.l10n.t('This catalog can\'t be submitted yet — please fix the issues below first.'),
            { modal: true, detail: report }
        );
        return;
    }

    const id = catalog.id ?? path.basename(catalog.fileName, path.extname(catalog.fileName));

    // 3. Load the community index (existing vendors + collision check). Best-effort.
    const index = await loadIndex(upstream);

    // 4. Resolve the destination path, prompting for vendor when not inferable.
    const repoPath = await resolveDestination(catalog, index);
    if (!repoPath) return;
    const isUpdate = !!index?.entries.some(e => e.path === repoPath);

    if (isUpdate) {
        const proceed = await vscode.window.showWarningMessage(
            vscode.l10n.t('A catalog already exists at "{0}". Your submission will propose an update to it.', repoPath),
            { modal: true },
            vscode.l10n.t('Continue')
        );
        if (!proceed) return;
    }

    // 5. Author + license consent.
    const author = await vscode.window.showInputBox({
        title: vscode.l10n.t('Contribute Catalog'),
        prompt: vscode.l10n.t('Your name (shown as the catalog author)'),
        value: await defaultAuthor(),
        ignoreFocusOut: true,
    });
    if (author === undefined) return;

    const consent = await vscode.window.showInformationMessage(
        vscode.l10n.t('By contributing, you agree to license this catalog under the community catalog\'s LICENSE.'),
        { modal: true, detail: vscode.l10n.t('Destination: {0}', repoPath) },
        vscode.l10n.t('Contribute')
    );
    if (!consent) return;

    // 6. Choose submission path (default to PR when already signed in to GitHub).
    const hasSession = !!(await vscode.authentication.getSession('github', ['public_repo'], { createIfNone: false }));
    const path_PR = vscode.l10n.t('Open a Pull Request');
    const path_Issue = vscode.l10n.t('Submit via Issue');
    const picks: vscode.QuickPickItem[] = [
        { label: path_PR, description: vscode.l10n.t('Uses your GitHub account — no manual fork or git needed') },
        { label: path_Issue, description: vscode.l10n.t('No fork or git — opens a pre-filled form in your browser') },
    ];
    if (!hasSession) picks.reverse(); // surface the lower-friction option first when not signed in
    const chosen = await vscode.window.showQuickPick(picks, {
        title: vscode.l10n.t('Contribute Catalog'),
        placeHolder: vscode.l10n.t('How would you like to submit "{0}"?', id),
    });
    if (!chosen) return;

    const ctx: SubmitContext = { upstream, repoPath, content, id, author: author.trim(), isUpdate };
    if (chosen.label === path_PR) {
        await runPullRequest(ctx);
    } else {
        await runIssue(ctx);
    }
}

interface SubmitContext {
    upstream: RepoSlug;
    repoPath: string;
    content: string;
    id: string;
    author: string;
    isUpdate: boolean;
}

async function runPullRequest(ctx: SubmitContext): Promise<void> {
    const body = renderPrBody(ctx);
    try {
        const result = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Contributing "{0}"…', ctx.id) },
            progress => contributeViaPullRequest(
                { upstream: ctx.upstream, repoPath: ctx.repoPath, content: ctx.content, id: ctx.id, prBody: body, isUpdate: ctx.isUpdate },
                progress
            )
        );
        const open = vscode.l10n.t('Open PR');
        const action = await vscode.window.showInformationMessage(vscode.l10n.t('Pull request opened 🎉'), open);
        if (action === open) {
            await vscode.env.openExternal(vscode.Uri.parse(result.prUrl));
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const fallback = vscode.l10n.t('Submit via Issue instead');
        const action = await vscode.window.showErrorMessage(
            vscode.l10n.t('Couldn\'t open the pull request: {0}', msg),
            fallback
        );
        if (action === fallback) await runIssue(ctx);
    }
}

async function runIssue(ctx: SubmitContext): Promise<void> {
    try {
        const { usedClipboard } = await submitViaIssue({
            upstream: ctx.upstream,
            repoPath: ctx.repoPath,
            id: ctx.id,
            author: ctx.author,
            content: ctx.content,
        });
        vscode.window.showInformationMessage(
            usedClipboard
                ? vscode.l10n.t('Catalog copied to clipboard — paste it into the form\'s YAML field.')
                : vscode.l10n.t('Opening the submission form in your browser…')
        );
    } catch (err) {
        vscode.window.showErrorMessage(
            vscode.l10n.t('Couldn\'t open the submission form: {0}', err instanceof Error ? err.message : String(err))
        );
    }
}

async function pickCatalog(uri?: vscode.Uri): Promise<LocalCatalog | undefined> {
    if (uri) {
        const all = await gatherLocalCatalogs();
        const match = all.find(c => c.fsPath === uri.fsPath);
        if (match) return match;
        // Right-clicked a YAML outside the scanned roots — still allow it.
        return { fsPath: uri.fsPath, fileName: path.basename(uri.fsPath) };
    }

    const catalogs = await gatherLocalCatalogs();
    if (catalogs.length === 0) {
        vscode.window.showInformationMessage(
            vscode.l10n.t('No local catalogs found. Author blocks under a project\'s .blocks/ folder first.')
        );
        return undefined;
    }
    const picked = await vscode.window.showQuickPick(
        catalogs.map(c => ({
            label: c.id ?? c.fileName,
            description: [c.category, c.vendor].filter(Boolean).join(' — '),
            detail: c.fsPath,
            catalog: c,
        })),
        { title: vscode.l10n.t('Contribute Catalog'), placeHolder: vscode.l10n.t('Select a catalog to contribute') }
    );
    return picked?.catalog;
}

async function resolveDestination(catalog: LocalCatalog, index: RegistryIndex | undefined): Promise<string | undefined> {
    let vendor = catalog.vendor;
    if (!vendor) {
        vendor = await promptVendor(index);
        if (!vendor) return undefined;
    }

    const initial = `catalogs/${vendor}/${catalog.fileName}`;
    const edited = await vscode.window.showInputBox({
        title: vscode.l10n.t('Contribute Catalog'),
        prompt: vscode.l10n.t('Destination path in the community catalog'),
        value: initial,
        ignoreFocusOut: true,
        validateInput: v => /^catalogs\/[^/]+\/[^/]+\.ya?ml$/i.test(v.trim())
            ? undefined
            : vscode.l10n.t('Must look like catalogs/<vendor>/<file>.yaml'),
    });
    return edited?.trim();
}

async function promptVendor(index: RegistryIndex | undefined): Promise<string | undefined> {
    const vendors = new Set<string>();
    for (const e of index?.entries ?? []) {
        const parts = e.path.replace(/^catalogs\//, '').split('/');
        if (parts.length > 1) vendors.add(parts[0]);
    }
    const NEW = vscode.l10n.t('New vendor…');
    const items = [...[...vendors].sort().map(v => ({ label: v })), { label: NEW }];
    const picked = await vscode.window.showQuickPick(items, {
        title: vscode.l10n.t('Contribute Catalog'),
        placeHolder: vscode.l10n.t('Choose a vendor folder'),
    });
    if (!picked) return undefined;
    if (picked.label !== NEW) return picked.label;

    return await vscode.window.showInputBox({
        title: vscode.l10n.t('Contribute Catalog'),
        prompt: vscode.l10n.t('New vendor folder name'),
        ignoreFocusOut: true,
        validateInput: v => /^[a-z0-9][a-z0-9_-]*$/i.test(v.trim())
            ? undefined
            : vscode.l10n.t('Use letters, numbers, hyphens or underscores'),
    }).then(v => v?.trim() || undefined);
}

async function loadIndex(upstream: RepoSlug): Promise<RegistryIndex | undefined> {
    const url = `https://raw.githubusercontent.com/${upstream.owner}/${upstream.repo}/main/index.json`;
    try {
        const buf = await httpGet(url);
        const parsed = JSON.parse(buf.toString('utf-8')) as RegistryIndex;
        return Array.isArray(parsed.entries) ? parsed : undefined;
    } catch {
        return undefined; // best-effort; vendor prompt still works, collision check just skipped
    }
}

async function defaultAuthor(): Promise<string> {
    try {
        const session = await vscode.authentication.getSession('github', ['public_repo'], { createIfNone: false });
        if (session?.account.label) return session.account.label;
    } catch { /* ignore */ }
    return '';
}

function renderPrBody(ctx: SubmitContext): string {
    // The file is the unit of contribution (it may hold multiple catalog
    // documents), so the body references the path, not a single id/category.
    return [
        `**Path:** \`${ctx.repoPath}\``,
        ctx.author ? `**Author:** ${ctx.author}` : '',
        '',
        '- [x] I agree to license this catalog under the repository LICENSE.',
        '',
        '_Submitted from the Blocks Editor VS Code extension._',
    ].filter(Boolean).join('\n');
}
