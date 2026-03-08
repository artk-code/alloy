import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';

import { JjAdapter } from '../src/jj.mjs';

test('JjAdapter bootstraps a workspace and captures a real patch snapshot', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'alloy-jj-'));
  const workspacePath = path.join(root, 'workspace');
  await fs.mkdir(workspacePath, { recursive: true });
  await fs.writeFile(path.join(workspacePath, 'demo.txt'), 'alpha\n', 'utf8');

  const adapter = new JjAdapter();
  const bootstrap = await adapter.bootstrapWorkspace({
    workspacePath,
    taskId: 'task_demo',
    candidateId: 'cand_a',
    candidateSlot: 'A',
    providerInstanceId: 'codex-1',
    baseRef: 'main'
  });

  await fs.writeFile(path.join(workspacePath, 'demo.txt'), 'alpha\nbeta\n', 'utf8');

  const patchPath = path.join(root, 'candidate.patch');
  const diffSummaryPath = path.join(root, 'diff-summary.txt');
  const statusPath = path.join(root, 'status.txt');
  const snapshot = await adapter.captureCandidateSnapshot({
    workspacePath,
    description: 'candidate demo',
    patchPath,
    diffSummaryPath,
    statusPath
  });

  const patch = await fs.readFile(patchPath, 'utf8');
  const diffSummary = await fs.readFile(diffSummaryPath, 'utf8');
  const status = await fs.readFile(statusPath, 'utf8');

  assert.equal(bootstrap.status, 'ready');
  assert.equal(bootstrap.base_revision.revset, '@-');
  assert.equal(snapshot.status, 'captured');
  assert.deepEqual(snapshot.changed_files, ['demo.txt']);
  assert.equal(snapshot.patch_stats.file_count, 1);
  assert.equal(snapshot.patch_stats.added_lines, 1);
  assert.match(patch, /diff --git a\/demo\.txt b\/demo\.txt/);
  assert.match(diffSummary, /M demo\.txt/);
  assert.match(status, /Working copy changes:/);

  await fs.rm(root, { recursive: true, force: true });
});
