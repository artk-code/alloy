import fs from 'node:fs/promises';
import path from 'node:path';

import { parseTaskBriefFile } from '../parser.mjs';
import { buildDefaultRunConfig } from '../run-config.mjs';

const PROVIDER_LABELS = {
  codex: 'Codex',
  gemini: 'Gemini CLI',
  'claude-code': 'Claude Code'
};

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
      objective: parsed.task.context || parsed.task.title,
      repo: parsed.task.repo,
      providers: parsed.task.providers,
      provider_labels: formatProviderLabels(parsed.task.providers),
      judge: parsed.task.judge,
      markdown_path: taskFile,
      demo_priority: parsed.task.demo_priority || 0,
      state: mapRunState(latestRun?.summary?.status || null),
      latest_run: latestRun?.summary || null,
      run_dir: latestRun?.runDir || null,
      acceptance_summary: summarizeAcceptanceChecks(parsed.task.acceptance_checks),
      card_summary: buildCardSummary(parsed.task, latestRun?.summary || null),
      decision_summary: latestRun?.summary?.evaluation?.decision?.summary || null
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
      task_brief: buildTaskBrief(parsed.task),
      run_config: latestRun?.summary?.run_config || buildDefaultRunConfig(parsed.task),
      evaluation: latestRun?.summary?.evaluation || null,
      latest_run_overview: buildLatestRunOverview(parsed.task, latestRun?.summary || null),
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

function buildCardSummary(task, summary) {
  if (!summary) {
    return 'No run prepared yet. Open the card, confirm provider login, and stage a candidate run.';
  }

  if (summary.evaluation?.decision?.card_summary) {
    return summary.evaluation.decision.card_summary;
  }

  if (summary.status === 'dry-run') {
    const candidateCount = Array.isArray(summary.candidate_results) ? summary.candidate_results.length : task.providers.length;
    return `Prepared ${candidateCount} candidate command${candidateCount === 1 ? '' : 's'} for operator review. No live provider execution has happened from the web UI yet.`;
  }

  if (summary.status === 'completed') {
    return 'A completed run exists, but no evaluator summary was captured for the current card view.';
  }

  if (summary.status === 'completed_with_failures') {
    return 'The latest run completed with failures. Inspect candidate details before trusting the output.';
  }

  return 'Task data is loaded, but no operator-facing run summary is available yet.';
}

function buildTaskBrief(task) {
  return {
    source_label: task.source_task_id
      ? `${task.source_system} task ${task.source_task_id}`
      : `${task.source_system} task`,
    repo_label: `${task.repo} on ${task.base_ref}`,
    objective: task.context || task.title,
    requirements: task.requirements || [],
    constraints: task.constraints || [],
    acceptance_checks: task.acceptance_checks || [],
    notes: task.human_notes || [],
    routing: {
      mode: task.mode,
      judge: PROVIDER_LABELS[task.judge] || task.judge,
      synthesis_policy: task.synthesis_policy,
      review_policy: task.human_review_policy
    }
  };
}

function buildLatestRunOverview(task, summary) {
  const statusLabel = mapRunState(summary?.status || null);
  const providerPlan = formatProviderLabels(task.providers).join(', ');
  const executionSummary = summary
    ? summarizeRunExecution(summary)
    : 'No run has been prepared yet for this task.';
  const decisionSummary = summary?.evaluation?.decision?.summary
    || (summary?.status === 'dry-run'
      ? 'This card has only been prepared as a dry run. Provider commands were generated, but the CLIs were not launched from the UI.'
      : 'No evaluator decision is available yet.');

  return {
    status_label: statusLabel,
    execution_summary: executionSummary,
    decision_summary: decisionSummary,
    provider_plan: providerPlan,
    acceptance_summary: summarizeAcceptanceChecks(task.acceptance_checks),
    finalists: summary?.evaluation?.decision?.finalists || [],
    winner: summary?.evaluation?.decision?.winner || null
  };
}

function summarizeRunExecution(summary) {
  const results = Array.isArray(summary.candidate_results) ? summary.candidate_results : [];
  if (summary.status === 'prepared') {
    const count = results.length || 0;
    return `Prepared ${count} candidate workspace${count === 1 ? '' : 's'} for follow-up execution.`;
  }

  if (summary.status === 'dry-run') {
    return `Prepared ${results.length} candidate session${results.length === 1 ? '' : 's'} with command previews only.`;
  }

  if (summary.status === 'completed') {
    const verified = results.filter((result) => result.verification?.status === 'pass').length;
    return `Completed ${results.length} candidate session${results.length === 1 ? '' : 's'} and verified ${verified}.`;
  }

  if (summary.status === 'completed_with_failures') {
    const failed = results.filter((result) => result.status === 'failed').length;
    return `Completed with ${failed} failed candidate session${failed === 1 ? '' : 's'}.`;
  }

  return `Latest run status: ${summary.status}.`;
}

function summarizeAcceptanceChecks(commands = []) {
  if (!commands.length) {
    return 'No acceptance checks defined.';
  }

  const preview = commands.slice(0, 2).join(' + ');
  return `${commands.length} check${commands.length === 1 ? '' : 's'}: ${preview}`;
}

function formatProviderLabels(providers = []) {
  return providers.map((provider) => PROVIDER_LABELS[provider] || provider);
}
