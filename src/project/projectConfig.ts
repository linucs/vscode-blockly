/** Sentinel name for a synthesized default env (no named profile/environment). */
export const DEFAULT_ENV_NAME = '';

/** Resolved configuration for a single build environment / profile. */
export interface ProjectEnv {
    /** Environment or profile name. */
    name: string;
    platform?: string;
    board?: string;
    framework?: string;
    /** Original Arduino FQBN (only for arduino projects). */
    fqbn?: string;
}

/** Which toolchain/backend a project uses (selects the packaging strategy). */
export type ProjectConfigType = 'platformio' | 'arduino' | 'app-lab' | 'manual';

/** Parsed project configuration from either platformio.ini or sketch.yaml. */
export interface ProjectConfig {
    /** Absolute path to the config file that was parsed. */
    configPath: string;
    /** Which toolchain this project uses. */
    configType: ProjectConfigType;
    /** All environments/profiles, in file order. */
    envs: ProjectEnv[];
    /** Fallback environment names in priority order. */
    defaultEnvs: string[];
}

/** Board context that drives catalog filtering for the active environment. */
export interface BoardContext {
    envName: string;
    platform?: string;
    board?: string;
    framework?: string;
    /** Original Arduino FQBN for extended target matching. */
    fqbn?: string;
}

/** Pick the active env: a requested one if valid, else defaultEnvs[0], else the first env. */
export function resolveActiveEnv(project: ProjectConfig, requested?: string): ProjectEnv | undefined {
    if (requested !== undefined) {
        const found = project.envs.find(e => e.name === requested);
        if (found) {return found;}
    }
    for (const name of project.defaultEnvs) {
        const found = project.envs.find(e => e.name === name);
        if (found) {return found;}
    }
    return project.envs[0];
}

/**
 * Last-resort fallback project: synthesized only when the detection chain finds
 * no real config (`loadProjectConfig` → undefined) and the user has manually
 * picked a framework (persisted in `blocks-editor.fallbackFramework`). The
 * `'manual'` configType has no registered backend, so `syncProjectConfig`
 * no-ops — nothing is written to disk. The runtime is composed downstream from
 * this framework plus the file's language; board is left undefined (universal
 * blocks only).
 */
export function synthesizeManualProject(configPath: string, framework: string): ProjectConfig {
    return {
        configPath,
        configType: 'manual',
        envs: [{ name: DEFAULT_ENV_NAME, framework }],
        defaultEnvs: [DEFAULT_ENV_NAME],
    };
}

export function toBoardContext(env: ProjectEnv): BoardContext {
    return {
        envName: env.name,
        platform: env.platform,
        board: env.board,
        framework: env.framework,
        fqbn: env.fqbn,
    };
}
