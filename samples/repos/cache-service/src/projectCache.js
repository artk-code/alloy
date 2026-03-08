/**
 * @typedef {{ id: string, name: string, updatedAt: string }} Project
 */

/** @type {Map<string, Project>} */
const CACHE = new Map();

/**
 * @param {string} projectId
 * @returns {string}
 */
export function cacheKeyForProject(projectId) {
  return `project:${projectId}`;
}

/**
 * @param {string} projectId
 * @returns {Project | null}
 */
export function readProjectFromCache(projectId) {
  return CACHE.get(cacheKeyForProject(projectId)) ?? null;
}

/**
 * @param {Project} project
 * @returns {Project}
 */
export function writeProjectToCache(project) {
  CACHE.set(cacheKeyForProject(project.id), { ...project });
  return project;
}

/**
 * BUG: this evicts by project name instead of project id, which leaves stale reads behind.
 * @param {Project} project
 */
export function invalidateProject(project) {
  CACHE.delete(cacheKeyForProject(project.name));
}

export function clearProjectCache() {
  CACHE.clear();
}
