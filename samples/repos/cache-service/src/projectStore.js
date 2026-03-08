/**
 * @typedef {{ id: string, name: string, updatedAt: string }} Project
 */

/** @type {Map<string, Project>} */
const PROJECTS = new Map([
  ['project-1', { id: 'project-1', name: 'Apollo', updatedAt: '2026-03-01T00:00:00.000Z' }],
  ['project-2', { id: 'project-2', name: 'Beacon', updatedAt: '2026-03-01T00:00:00.000Z' }]
]);

/**
 * @param {string} projectId
 * @returns {Project}
 */
export function getProject(projectId) {
  const project = PROJECTS.get(projectId);
  if (!project) {
    throw new Error(`Unknown project: ${projectId}`);
  }
  return { ...project };
}

/**
 * @param {string} projectId
 * @param {{ name?: string }} updates
 * @returns {Project}
 */
export function updateProject(projectId, updates) {
  const current = getProject(projectId);
  const next = {
    ...current,
    ...updates,
    updatedAt: new Date('2026-03-08T00:00:00.000Z').toISOString()
  };
  PROJECTS.set(projectId, next);
  return { ...next };
}

export function resetProjects() {
  PROJECTS.set('project-1', { id: 'project-1', name: 'Apollo', updatedAt: '2026-03-01T00:00:00.000Z' });
  PROJECTS.set('project-2', { id: 'project-2', name: 'Beacon', updatedAt: '2026-03-01T00:00:00.000Z' });
}
