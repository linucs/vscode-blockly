import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { resolveActiveWorkspaceRoot } from '../util/workspaceRoot';

const SERVER_KEY = 'blocks-editor';
const SKILL_REL = path.join('.claude', 'skills', 'block-author');
const SKILL_FILES = ['SKILL.md', 'reference.md'];

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
        if (typeof config !== 'object' || config === null) config = {};
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
 * Copy the bundled block-author skill (SKILL.md + reference.md) into the user's
 * project at `.claude/skills/block-author/`, so Claude Code discovers it. The
 * skill is shipped in the .vsix via a `.vscodeignore` exception.
 */
async function installSkill(extensionPath: string, root: string): Promise<{ ok: boolean }> {
    const srcDir = path.join(extensionPath, SKILL_REL);
    const destDir = path.join(root, SKILL_REL);

    try {
        await fs.mkdir(destDir, { recursive: true });
        for (const file of SKILL_FILES) {
            await fs.copyFile(path.join(srcDir, file), path.join(destDir, file));
        }
        return { ok: true };
    } catch (err) {
        // Non-fatal: the MCP server still works without the skill installed.
        vscode.window.showWarningMessage(
            vscode.l10n.t('MCP configured, but the block-author skill could not be installed: {0}', err instanceof Error ? err.message : String(err))
        );
        return { ok: false };
    }
}
