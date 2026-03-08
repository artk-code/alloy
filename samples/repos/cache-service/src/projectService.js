import { clearProjectCache, invalidateProject, readProjectFromCache, writeProjectToCache } from './projectCache.js';
import { getProject, updateProject } from './projectStore.js';

/**
 * @param {string} projectId
 */
export function getProjectDetails(projectId) {
  const cached = readProjectFromCache(projectId);
  if (cached) {
    return cached;
  }

  const project = getProject(projectId);
  return writeProjectToCache(project);
}

/**
 * @param {string} projectId
 * @param {{ name?: string }} updates
 */
export function updateProjectDetails(projectId, updates) {
  const project = updateProject(projectId, updates);
  invalidateProject(project);
  return project;
}

export function resetProjectService() {
  clearProjectCache();
}
