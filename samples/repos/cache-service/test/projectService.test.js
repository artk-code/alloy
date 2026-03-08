import test from 'node:test';
import assert from 'node:assert/strict';

import { getProjectDetails, resetProjectService, updateProjectDetails } from '../src/projectService.js';
import { resetProjects } from '../src/projectStore.js';

function resetAll() {
  resetProjectService();
  resetProjects();
}

test('returns cached project details until cache is invalidated', () => {
  resetAll();

  const initial = getProjectDetails('project-1');
  assert.equal(initial.name, 'Apollo');

  updateProjectDetails('project-1', { name: 'Apollo Prime' });

  const refreshed = getProjectDetails('project-1');
  assert.equal(refreshed.name, 'Apollo Prime');
});
