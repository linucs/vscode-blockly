import { ProjectConfig, ProjectConfigType, ProjectEnv } from './projectConfig';
import { ProjectRequirements } from '../catalog/requirements';

/**
 * Everything a `sync` needs to package dependencies, plus injected file I/O so
 * backends stay free of `vscode` imports (and unit-testable). A backend reads
 * each file fresh via `readFile` *immediately before* merging and writing it —
 * the documented add-only / lost-update mitigation (the arduino-cli daemon may
 * rewrite sketch.yaml concurrently). Do not hoist those reads.
 */
export interface BackendSyncContext {
    project: ProjectConfig;
    activeEnv: ProjectEnv;
    requirements: ProjectRequirements;
    /** Read a project file fresh from disk; undefined if it can't be read. */
    readFile(absPath: string): Promise<string | undefined>;
    /** Write a project file. */
    writeFile(absPath: string, content: string): Promise<void>;
}

/**
 * A toolchain backend (axis 3): detects/loads a project's config and packages
 * the required dependencies into that backend's file(s). Registered in
 * `backendRegistry.ts` — adding a backend is a new implementation + one line.
 */
export interface ProjectBackend {
    readonly configType: ProjectConfigType;
    /** Display name for the both-present disambiguation quick-pick. */
    readonly label: string;
    /** Config filename shown in the quick-pick (e.g. `platformio.ini`). */
    readonly fileLabel: string;
    /** Locate this backend's config file walking up from the source file. */
    find(documentFsPath: string): Promise<string | undefined>;
    /** Parse the config file → ProjectConfig (board/envs). */
    load(documentFsPath: string): Promise<ProjectConfig | undefined>;
    /** Add-only merge the required dependencies into this backend's file(s). */
    sync(ctx: BackendSyncContext): Promise<void>;
}
