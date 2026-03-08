import fs from 'node:fs/promises';
import path from 'node:path';

const QUEUE_PATH = ['runtime', 'task-queue.json'];

export async function readTaskQueue(projectRoot) {
  const filePath = path.join(projectRoot, ...QUEUE_PATH);
  const queue = await fs.readFile(filePath, 'utf8')
    .then((content) => JSON.parse(content))
    .catch(() => null);

  if (!queue || !Array.isArray(queue.tasks)) {
    return {
      version: 1,
      tasks: []
    };
  }

  return {
    version: 1,
    tasks: queue.tasks
      .filter((entry) => entry && entry.task_id)
      .map((entry) => ({
        task_id: entry.task_id,
        project_id: entry.project_id || null,
        status: entry.status || 'queued',
        priority: Number.isFinite(entry.priority) ? entry.priority : 50,
        position: Number.isFinite(entry.position) ? entry.position : null,
        run_config_snapshot: entry.run_config_snapshot || null,
        latest_run_dir: entry.latest_run_dir || null,
        queued_at: entry.queued_at || null,
        queued_by: entry.queued_by || 'operator',
        note: entry.note || ''
      }))
  };
}

export async function getQueuedTaskMap(projectRoot) {
  const queue = await readTaskQueue(projectRoot);
  return new Map(queue.tasks.map((entry) => [entry.task_id, entry]));
}

export async function enqueueTask(projectRoot, task, options = {}) {
  const queue = await readTaskQueue(projectRoot);
  const now = options.queuedAt || new Date().toISOString();
  const entry = {
    task_id: task.task_id,
    project_id: task.project_id || null,
    status: options.status || 'queued',
    priority: Number.isFinite(options.priority) ? options.priority : 50,
    position: Number.isFinite(options.position) ? options.position : null,
    run_config_snapshot: options.runConfigSnapshot || null,
    latest_run_dir: options.latestRunDir || null,
    queued_at: now,
    queued_by: options.queuedBy || 'operator',
    note: options.note || ''
  };

  const existingIndex = queue.tasks.findIndex((item) => item.task_id === task.task_id);
  if (existingIndex >= 0) {
    queue.tasks[existingIndex] = {
      ...queue.tasks[existingIndex],
      ...entry
    };
  } else {
    queue.tasks.unshift(entry);
  }

  await writeTaskQueue(projectRoot, queue);
  return entry;
}

export async function dequeueTask(projectRoot, taskId) {
  const queue = await readTaskQueue(projectRoot);
  const nextTasks = queue.tasks.filter((entry) => entry.task_id !== taskId);
  const removed = nextTasks.length !== queue.tasks.length;
  if (removed) {
    await writeTaskQueue(projectRoot, {
      ...queue,
      tasks: nextTasks
    });
  }
  return { removed };
}

export async function updateQueuedTask(projectRoot, taskId, patch = {}) {
  const queue = await readTaskQueue(projectRoot);
  const index = queue.tasks.findIndex((entry) => entry.task_id === taskId);
  if (index < 0) {
    return null;
  }

  queue.tasks[index] = {
    ...queue.tasks[index],
    ...patch
  };
  await writeTaskQueue(projectRoot, queue);
  return queue.tasks[index];
}

async function writeTaskQueue(projectRoot, queue) {
  const filePath = path.join(projectRoot, ...QUEUE_PATH);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(queue, null, 2), 'utf8');
}
