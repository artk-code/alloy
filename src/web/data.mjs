import fs from 'node:fs/promises';
import path from 'node:path';

import { parseTaskBriefFile } from '../parser.mjs';
import { buildDefaultRunConfig } from '../run-config.mjs';

export async function listTaskCards(projectRoot) {
  const taskFiles = await findTaskFiles(path.join(projectRoot, 'samples', 'tasks'));
  const cards = [];

  for (const taskFile of taskFiles) {
    const parsed = await parseTaskBriefFile(taskFile);
    const latestRun = await findLatestRun(projectRoot, parsed.task.task_id);
    cards.push({
      task_id: parsed.task.task_id,
      source_system: parsed.task.source_system,
      source_task_id: parsed.task.source_task_id || null,
      title: parsed.task.title,
      repo: parsed.task.repo,
      providers: parsed.task.providers,
      judge: parsed.task.judge,
      markdown_path: taskFile,
      demo_priority: parsed.task.demo_priority || 0,
      state: mapRunState(latestRun?.summary?.status || null),
      latest_run: latestRun?.summary || null,
      run_dir: latestRun?.runDir || null
    });
  }

  return cards.sort((left, right) => {
    if ((right.demo_priority || 0) !== (left.demo_priority || 0)) {
      return (right.demo_priority || 0) - (left.demo_priority || 0);
    }
    return left.task_id.localeCompare(right.task_id);
  });
}

export async function getTaskDetail(projectRoot, taskId) {
  const taskFiles = await findTaskFiles(path.join(projectRoot, 'samples', 'tasks'));
  for (const taskFile of taskFiles) {
    const parsed = await parseTaskBriefFile(taskFile);
    if (parsed.task.task_id !== taskId) {
      continue;
    }

    const latestRun = await findLatestRun(projectRoot, taskId);
    return {
      task_id: parsed.task.task_id,
      markdown_path: taskFile,
      markdown: parsed.markdown,
      task: parsed.task,
      run_config: latestRun?.summary?.run_config || buildDefaultRunConfig(parsed.task),
      evaluation: latestRun?.summary?.evaluation || null,
      warnings: parsed.warnings,
      latest_run: latestRun?.summary || null,
      run_dir: latestRun?.runDir || null,
      candidates: latestRun ? await readCandidateManifests(latestRun.runDir) : [],
      sessions: latestRun ? await readSessionRecordsForCandidates(latestRun.runDir) : []
    };
  }

  return null;
}

async function readSessionRecordsForCandidates(runDir) {
  const candidateManifests = await readCandidateManifests(runDir);
  const sessions = [];

  for (const manifest of candidateManifests) {
    if (!manifest.session_record_path) {
      continue;
    }
    try {
      sessions.push(JSON.parse(await fs.readFile(manifest.session_record_path, 'utf8')));
    } catch {
      continue;
    }
  }

  return sessions.sort((left, right) => String(right.started_at || '').localeCompare(String(left.started_at || '')));
}

async function findTaskFiles(tasksDir) {
  const entries = await fs.readdir(tasksDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.task.md'))
    .map((entry) => path.join(tasksDir, entry.name));
}

async function findLatestRun(projectRoot, taskId) {
  const runsDir = path.join(projectRoot, 'runs');
  const entries = await fs.readdir(runsDir, { withFileTypes: true }).catch(() => []);
  const matches = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(taskId))
    .map((entry) => path.join(runsDir, entry.name))
    .sort()
    .reverse();

  for (const runDir of matches) {
    const summaryPath = path.join(runDir, 'run-summary.json');
    try {
      const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
      return { runDir, summary };
    } catch {
      continue;
    }
  }

  return null;
}

async function readCandidateManifests(runDir) {
  const candidateDir = path.join(runDir, 'candidates');
  const entries = await fs.readdir(candidateDir, { withFileTypes: true }).catch(() => []);
  const manifests = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const manifestPath = path.join(candidateDir, entry.name, 'manifest.json');
    try {
      manifests.push(JSON.parse(await fs.readFile(manifestPath, 'utf8')));
    } catch {
      continue;
    }
  }

  return manifests.sort((left, right) => left.candidate_slot.localeCompare(right.candidate_slot));
}

function mapRunState(status) {
  switch (status) {
    case 'prepared':
      return 'Ready';
    case 'dry-run':
      return 'Prepared';
    case 'completed':
      return 'PR Ready';
    case 'completed_with_failures':
      return 'Failed';
    default:
      return 'Draft';
  }
}
