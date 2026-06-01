import * as vscode from 'vscode';
import { ProjectConfig } from './projectConfig';
import { findPlatformIni, loadPlatformioProject } from './pio/platformIni';
import { findSketchYaml, loadArduinoProject } from './arduino/sketchYaml';

/**
 * Locate and load the project configuration for a given source file.
 *
 * Searches for both `platformio.ini` and `sketch.yaml` walking up from the
 * file path. When both are found, a quick-pick lets the user choose which
 * toolchain should drive the block editor for this session.
 */
export async function loadProjectConfig(documentFsPath: string): Promise<ProjectConfig | undefined> {
    const [iniPath, yamlPath] = await Promise.all([
        findPlatformIni(documentFsPath),
        findSketchYaml(documentFsPath),
    ]);

    if (iniPath && yamlPath) {
        const choice = await vscode.window.showQuickPick(
            [
                { label: 'PlatformIO', description: 'platformio.ini', detail: iniPath, configType: 'platformio' as const },
                { label: 'Arduino CLI', description: 'sketch.yaml', detail: yamlPath, configType: 'arduino' as const },
            ],
            {
                placeHolder: 'Both platformio.ini and sketch.yaml found. Which should drive the block editor?',
                ignoreFocusOut: true,
            },
        );
        if (!choice) return undefined;
        return choice.configType === 'platformio'
            ? loadPlatformioProject(documentFsPath)
            : loadArduinoProject(documentFsPath);
    }

    if (iniPath) return loadPlatformioProject(documentFsPath);
    if (yamlPath) return loadArduinoProject(documentFsPath);
    return undefined;
}
