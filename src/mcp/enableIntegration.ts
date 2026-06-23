import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { resolveActiveWorkspaceRoot } from '../util/workspaceRoot';

const SERVER_KEY = 'blocks-editor';
const SKILL_REL = path.join('.claude', 'skills', 'block-author');
const COPILOT_INSTRUCTIONS_REL = path.join('.github', 'instructions', 'block-author.instructions.md');

interface McpServerEntry {
    type: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
}

interface McpConfig {
    mcpServers?: Record<string, McpServerEntry>;
    [key: string]: unknown;
}

/**
 * Generate (or update) a project-scoped `.mcp.json` so Claude Code can discover
 * and connect to this extension's bundled MCP server. The server path is
 * absolute and version-specific, so re-running the command after an extension
 * upgrade refreshes it. Existing entries in `.mcp.json` are preserved.
 */
export async function enableClaudeCodeIntegration(context: vscode.ExtensionContext): Promise<void> {
    const root = await resolveActiveWorkspaceRoot(
        vscode.l10n.t('Select the folder to enable Claude Code integration in')
    );
    if (!root) {
        vscode.window.showWarningMessage(
            vscode.l10n.t('Open a workspace folder before enabling Claude Code integration.')
        );
        return;
    }

    const serverPath = path.join(context.extensionPath, 'dist', 'mcp-server.js');
    const mcpJsonPath = path.join(root, '.mcp.json');

    let config: McpConfig = {};
    try {
        const existing = await fs.readFile(mcpJsonPath, 'utf-8');
        config = JSON.parse(existing) as McpConfig;
        if (typeof config !== 'object' || config === null) {config = {};}
    } catch {
        // ENOENT or invalid JSON — start fresh.
    }

    config.mcpServers = config.mcpServers ?? {};
    config.mcpServers[SERVER_KEY] = {
        type: 'stdio',
        command: 'node',
        args: [serverPath],
        env: { BLOCKS_WORKSPACE_ROOT: root },
    };

    try {
        await fs.writeFile(mcpJsonPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    } catch (err) {
        vscode.window.showErrorMessage(
            vscode.l10n.t('Failed to write .mcp.json: {0}', err instanceof Error ? err.message : String(err))
        );
        return;
    }

    const skillResult = await installSkill(context.extensionPath, root);

    const skillSuffix = skillResult.ok
        ? vscode.l10n.t(' (block-author skill installed). ')
        : vscode.l10n.t('. ');
    const openLabel = vscode.l10n.t('Open .mcp.json');
    const choice = await vscode.window.showInformationMessage(
        vscode.l10n.t(
            'Claude Code integration enabled{0}. In a Claude Code session for this project, run /mcp and approve the "blocks-editor" server. Re-run this command after upgrading the extension to refresh the server path and skill.',
            skillSuffix
        ),
        openLabel
    );
    if (choice === openLabel) {
        const doc = await vscode.workspace.openTextDocument(mcpJsonPath);
        await vscode.window.showTextDocument(doc);
    }
}

/**
 * Materialise the bundled block-author skill for both AI hosts. The single
 * source of truth is the skill at `.claude/skills/block-author/` (`SKILL.md`,
 * `reference.md`, `blockly_schema.yaml`), shipped in the .vsix via a
 * `.vscodeignore` exception. The two hosts discover guidance differently:
 *
 * - **Claude Code** natively discovers Agent Skills under `.claude/skills/`,
 *   reads `SKILL.md`, and lazily loads `reference.md`/the schema only when the
 *   skill triggers. We just copy the whole skill dir (recursive) so EVERY file
 *   it ships — and any future resource — lands in the workspace, no per-file
 *   list to keep in sync.
 * - **GitHub Copilot** does NOT read `.claude/skills/`. In VS Code it reads
 *   instruction files from `.github/instructions/*.instructions.md`, gated by an
 *   `applyTo` glob. We generate that file with `applyTo: "**"` (injected on every
 *   request) pointing Copilot at the SAME copied `reference.md`/schema — so both
 *   hosts share one source of truth instead of a duplicated, drift-prone copy.
 */
async function installSkill(extensionPath: string, root: string): Promise<{ ok: boolean }> {
    const srcDir = path.join(extensionPath, SKILL_REL);
    const destDir = path.join(root, SKILL_REL);

    try {
        await fs.cp(srcDir, destDir, { recursive: true });
        await writeCopilotInstructions(srcDir, root);
        return { ok: true };
    } catch (err) {
        // Non-fatal: the MCP server still works without the skill installed.
        vscode.window.showWarningMessage(
            vscode.l10n.t('MCP configured, but the block-author skill could not be installed: {0}', err instanceof Error ? err.message : String(err))
        );
        return { ok: false };
    }
}

/**
 * Generate the Copilot instructions file by DERIVING it from the skill's own
 * `SKILL.md` — strip the YAML frontmatter, prepend an `applyTo: "**"` header (so
 * Copilot injects it on every request) plus an auto-read directive. This keeps
 * the two AI hosts' entry points mirrored from one source: Claude Code reads
 * `SKILL.md` natively, Copilot reads this derived copy. There is no separate
 * hand-written string to drift out of sync.
 *
 * Why a derivation works without rewriting any paths: `SKILL.md` references its
 * sibling docs by their **workspace-root-relative** paths (e.g.
 * `.claude/skills/block-author/reference.md`), which BOTH hosts resolve from the
 * workspace root — even though this generated file lives under `.github/`. The
 * heavy docs (`reference.md`, `blockly_schema.yaml`) are pointed at, never
 * inlined, so they load only when a block-authoring task is actually in play.
 *
 * Fully generated → overwritten wholesale on re-install.
 */
async function writeCopilotInstructions(srcDir: string, root: string): Promise<void> {
    const skill = await fs.readFile(path.join(srcDir, 'SKILL.md'), 'utf-8');

    const header = [
        '---',
        'applyTo: "**"',
        '---',
        '',
        '<!-- Generated from .claude/skills/block-author/SKILL.md by the Maker Block Studio extension',
        '     ("Maker Block Studio: Set Up AI Assistants"). Edits here are overwritten on re-install —',
        '     change the skill instead. -->',
        '',
        'The following is MANDATORY whenever the user asks to create, design, or generate block',
        'catalog YAML for a hardware board, component, sensor, or actuator. Follow it exactly — the',
        'directives below are not optional.',
        '',
        '---',
        '',
    ].join('\n');

    const content = header + stripFrontmatter(skill).trimStart() + '\n';

    const destPath = path.join(root, COPILOT_INSTRUCTIONS_REL);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, content, 'utf-8');
}

/** Drop a leading `---`…`---` YAML frontmatter block, if present. */
function stripFrontmatter(md: string): string {
    const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(md);
    return m ? md.slice(m[0].length) : md;
}
