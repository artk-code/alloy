import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

import { dequeueTask, enqueueTask, readTaskQueue, updateQueuedTask } from '../src/task-queue.mjs';

test('task queue persists enqueue, update, and dequeue lifecycle', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'alloy-task-queue-'));

  const empty = await readTaskQueue(tempRoot);
  assert.deepEqual(empty.tasks, []);

  const entry = await enqueueTask(tempRoot, {
    task_id: 'task_demo',
    project_id: 'demo-lab'
  }, {
    queuedBy: 'test',
    priority: 90
  });

  assert.equal(entry.task_id, 'task_demo');
  assert.equal(entry.status, 'queued');

  const updated = await updateQueuedTask(tempRoot, 'task_demo', {
    status: 'previewed',
    latest_run_dir: '/tmp/run'
  });
  assert.equal(updated.status, 'previewed');
  assert.equal(updated.latest_run_dir, '/tmp/run');

  const persisted = await readTaskQueue(tempRoot);
  assert.equal(persisted.tasks.length, 1);
  assert.equal(persisted.tasks[0].status, 'previewed');

  const removed = await dequeueTask(tempRoot, 'task_demo');
  assert.equal(removed.removed, true);

  const finalState = await readTaskQueue(tempRoot);
  assert.deepEqual(finalState.tasks, []);

  await rm(tempRoot, { recursive: true, force: true });
});
