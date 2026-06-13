import { ProjectConfig } from './projectConfig';
import { selectBackend } from './backendRegistry';

/**
 * Locate and load the project configuration for a given source file.
 *
 * Detection and the both-present disambiguation quick-pick live in the backend
 * registry; this is a thin delegate over `selectBackend`.
 */
export async function loadProjectConfig(documentFsPath: string): Promise<ProjectConfig | undefined> {
    const backend = await selectBackend(documentFsPath);
    return backend ? backend.load(documentFsPath) : undefined;
}
