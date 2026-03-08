import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { JjAdapter } from '../src/jj.mjs';

const execFileAsync = promisify(execFile);

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

test('JjAdapter exposes split, rebase, squash, and range-capture helpers for stack shaping', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'alloy-jj-shape-'));
  const workspacePath = path.join(root, 'workspace');
  await fs.mkdir(path.join(workspacePath, 'docs'), { recursive: true });
  await fs.writeFile(path.join(workspacePath, 'app.txt'), 'alpha\n', 'utf8');
  await fs.writeFile(path.join(workspacePath, 'test.txt'), 'spec\n', 'utf8');
  await fs.writeFile(path.join(workspacePath, 'docs', 'note.md'), 'hello\n', 'utf8');

  const adapter = new JjAdapter();
  const bootstrap = await adapter.bootstrapWorkspace({
    workspacePath,
    taskId: 'task_stack',
    candidateId: 'cand_s',
    candidateSlot: 'S',
    providerInstanceId: 'alloy-synthesis',
    baseRef: 'main'
  });

  await fs.writeFile(path.join(workspacePath, 'app.txt'), 'alpha\nbeta\n', 'utf8');
  await fs.writeFile(path.join(workspacePath, 'test.txt'), 'spec\nassert\n', 'utf8');
  await fs.writeFile(path.join(workspacePath, 'docs', 'note.md'), 'hello\nupdated\n', 'utf8');
  await adapter.run(['describe', '-m', 'combined'], { cwd: workspacePath });

  await adapter.splitRevisionByFiles({
    workspacePath,
    revision: '@',
    files: ['test.txt'],
    message: 'tests'
  });
  await adapter.splitRevisionByFiles({
    workspacePath,
    revision: '@',
    files: ['docs/note.md'],
    message: 'docs'
  });
  await adapter.rebaseRevisionAfter({
    workspacePath,
    revision: '@-',
    destination: '@'
  });
  await adapter.editRevision({
    workspacePath,
    revision: '@+'
  });

  const tip = await adapter.readRevision({ workspacePath, revset: '@' });
  const parent = await adapter.readRevision({ workspacePath, revset: '@-' });
  const grandparent = await adapter.readRevision({ workspacePath, revset: '@--' });
  assert.equal(tip.description, 'docs');
  assert.equal(parent.description, 'combined');
  assert.equal(grandparent.description, 'tests');

  const patchPath = path.join(root, 'stack.patch');
  const diffSummaryPath = path.join(root, 'stack-summary.txt');
  const statusPath = path.join(root, 'stack-status.txt');
  const rangeSnapshot = await adapter.captureDiffRange({
    workspacePath,
    fromRev: bootstrap.base_revision.commit_id,
    toRev: '@',
    patchPath,
    diffSummaryPath,
    statusPath,
    role: 'synthesis'
  });
  const patch = await fs.readFile(patchPath, 'utf8');
  assert.deepEqual(rangeSnapshot.changed_files.sort(), ['app.txt', 'docs/note.md', 'test.txt']);
  assert.match(patch, /diff --git a\/app\.txt b\/app\.txt/);
  assert.match(patch, /diff --git a\/docs\/note\.md b\/docs\/note\.md/);
  assert.match(patch, /diff --git a\/test\.txt b\/test\.txt/);

  const squashResult = await adapter.squashRevisionInto({
    workspacePath,
    fromRevision: '@',
    intoRevision: '@-'
  });
  assert.ok(squashResult.into_revision.commit_id);
  assert.ok(squashResult.current_revision.commit_id);

  await fs.rm(root, { recursive: true, force: true });
});

test('JjAdapter can push a bookmark to a real bare Git remote', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'alloy-jj-push-'));
  const workspacePath = path.join(root, 'workspace');
  const remotePath = path.join(root, 'remote.git');
  await fs.mkdir(workspacePath, { recursive: true });
  await fs.writeFile(path.join(workspacePath, 'demo.txt'), 'alpha\n', 'utf8');
  await execFileAsync('git', ['init', '--bare', remotePath], { cwd: root });

  const adapter = new JjAdapter();
  await adapter.bootstrapWorkspace({
    workspacePath,
    taskId: 'task_publish',
    candidateId: 'cand_publish',
    candidateSlot: 'S',
    providerInstanceId: 'alloy-synthesis',
    baseRef: 'main'
  });

  await fs.writeFile(path.join(workspacePath, 'demo.txt'), 'alpha\nbeta\n', 'utf8');
  await adapter.run(['describe', '-m', 'publishable'], { cwd: workspacePath });
  await execFileAsync('git', ['remote', 'add', 'origin', remotePath], { cwd: workspacePath });

  const result = await adapter.pushBookmark({
    workspacePath,
    bookmark: 'alloy/task-publish/synth-1',
    remote: 'origin'
  });
  const { stdout } = await execFileAsync('git', ['--git-dir', remotePath, 'show-ref'], { cwd: root });

  assert.equal(result.status, 'success');
  assert.equal(result.remote, 'origin');
  assert.equal(result.bookmark, 'alloy/task-publish/synth-1');
  assert.equal(result.published_ref, 'origin/alloy/task-publish/synth-1');
  assert.match(stdout, /refs\/heads\/alloy\/task-publish\/synth-1/);

  await fs.rm(root, { recursive: true, force: true });
});
