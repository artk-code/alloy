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
    const latestRun = await findLatestRun(projectRoot, parsed.task.project_id, parsed.task.task_id);
    cards.push({
      project_id: parsed.task.project_id,
      project_label: parsed.task.project_label,
      task_id: parsed.task.task_id,
      source_system: parsed.task.source_system,
      source_label: formatSourceLabel(parsed.task),
      source_task_id: parsed.task.source_task_id || null,
      title: parsed.task.title,
      objective: parsed.task.context || parsed.task.title,
      repo: parsed.task.repo,
      providers: parsed.task.providers,
      provider_labels: formatProviderLabels(parsed.task.providers),
      judge: parsed.task.judge,
      markdown_path: taskFile,
      demo_priority: parsed.task.demo_priority || 0,
      state: deriveRunDisplayState(latestRun?.summary || null),
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

    const latestRun = await findLatestRun(projectRoot, parsed.task.project_id, taskId);
    const candidates = latestRun ? await readCandidateManifests(latestRun.runDir) : [];
    const synthesis = latestRun ? await readLatestSynthesisManifest(latestRun.summary) : null;
    return {
      project_id: parsed.task.project_id,
      project_label: parsed.task.project_label,
      task_id: parsed.task.task_id,
      markdown_path: taskFile,
      markdown: parsed.markdown,
      task: parsed.task,
      task_brief: buildTaskBrief(parsed.task),
      run_config: latestRun?.summary?.run_config || buildDefaultRunConfig(parsed.task),
      evaluation: latestRun?.summary?.evaluation || null,
      latest_run_overview: buildLatestRunOverview(parsed.task, latestRun?.summary || null),
      comparison_view: buildComparisonView(latestRun?.summary?.evaluation || null, candidates),
      merge_view: buildMergeView(latestRun?.summary || null, candidates, synthesis),
      warnings: parsed.warnings,
      latest_run: latestRun?.summary || null,
      run_dir: latestRun?.runDir || null,
      candidates,
      sessions: latestRun ? await readSessionRecordsForCandidates(latestRun.runDir) : [],
      synthesis
    };
  }

  return null;
}

export async function getCandidateDiff(projectRoot, taskId, candidateId) {
  const task = await findTaskById(projectRoot, taskId);
  const latestRun = task ? await findLatestRun(projectRoot, task.project_id, taskId) : null;
  if (!latestRun) {
    return null;
  }

  const manifest = await readCandidateManifest(latestRun.runDir, candidateId);
  if (!manifest) {
    return null;
  }

  const patchText = await fs.readFile(manifest.artifact_paths.patch_path, 'utf8').catch(() => '');
  const diffSummary = await fs.readFile(manifest.artifact_paths.diff_summary_path, 'utf8').catch(() => '');
  const filePatches = splitPatchByFile(patchText, manifest.changed_files || []);

  return {
    task_id: taskId,
    run_dir: latestRun.runDir,
    candidate_id: manifest.candidate_id,
    candidate_slot: manifest.candidate_slot,
    provider: manifest.provider,
    provider_label: PROVIDER_LABELS[manifest.provider] || manifest.provider,
    label: `${manifest.candidate_slot} / ${PROVIDER_LABELS[manifest.provider] || manifest.provider}`,
    changed_files: manifest.changed_files || [],
    diff_summary: diffSummary.trim(),
    patch: patchText,
    files: filePatches,
    verification: manifest.verification || null,
    jj: manifest.jj || null
  };
}

export async function getCandidateJj(projectRoot, taskId, candidateId) {
  const task = await findTaskById(projectRoot, taskId);
  const latestRun = task ? await findLatestRun(projectRoot, task.project_id, taskId) : null;
  if (!latestRun) {
    return null;
  }
  const manifest = await readCandidateManifest(latestRun.runDir, candidateId);
  if (!manifest) {
    return null;
  }
  return {
    task_id: taskId,
    candidate_id: manifest.candidate_id,
    candidate_slot: manifest.candidate_slot,
    provider: manifest.provider,
    jj: manifest.jj || null
  };
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

async function findTaskById(projectRoot, taskId) {
  const taskFiles = await findTaskFiles(path.join(projectRoot, 'samples', 'tasks'));
  for (const taskFile of taskFiles) {
    const parsed = await parseTaskBriefFile(taskFile);
    if (parsed.task.task_id === taskId) {
      return parsed.task;
    }
  }
  return null;
}

async function findLatestRun(projectRoot, projectId, taskId) {
  const runsDir = path.join(projectRoot, 'runs');
  const projectRunsDir = projectId ? path.join(runsDir, projectId) : runsDir;
  const projectEntries = await fs.readdir(projectRunsDir, { withFileTypes: true }).catch(() => []);
  const projectMatches = projectEntries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(taskId))
    .map((entry) => path.join(projectRunsDir, entry.name))
    .sort()
    .reverse();

  const fallbackEntries = await fs.readdir(runsDir, { withFileTypes: true }).catch(() => []);
  const fallbackMatches = fallbackEntries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(taskId))
    .map((entry) => path.join(runsDir, entry.name))
    .sort()
    .reverse();

  const matches = [...projectMatches, ...fallbackMatches];

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

async function readCandidateManifest(runDir, candidateId) {
  const manifests = await readCandidateManifests(runDir);
  return manifests.find((manifest) => manifest.candidate_id === candidateId) || null;
}

async function readLatestSynthesisManifest(summary) {
  if (!summary?.synthesis?.manifest_path) {
    return null;
  }
  return JSON.parse(await fs.readFile(summary.synthesis.manifest_path, 'utf8').catch(() => 'null'));
}

function mapRunState(status) {
  switch (status) {
    case 'prepared':
      return 'Prepared';
    case 'dry-run':
      return 'Previewed';
    case 'completed':
      return 'Completed';
    case 'completed_with_failures':
      return 'Failed';
    default:
      return 'Draft';
  }
}

function deriveRunDisplayState(summary) {
  if (!summary) {
    return 'Draft';
  }

  if (summary.synthesis?.status === 'completed') {
    return 'Synthesized';
  }

  if (summary.synthesis?.status === 'failed') {
    return 'Synthesis Failed';
  }

  if (summary.status === 'prepared') {
    return 'Prepared';
  }

  if (summary.status === 'dry-run') {
    return 'Previewed';
  }

  if (summary.status === 'completed_with_failures') {
    return 'Failed';
  }

  const decisionMode = summary.evaluation?.decision?.mode || null;
  if (decisionMode === 'winner') {
    return 'Winner Ready';
  }
  if (decisionMode === 'synthesize') {
    return 'Needs Merge';
  }
  if (decisionMode === 'no_winner') {
    return 'No Winner';
  }

  if (summary.status === 'completed') {
    return 'Verified Run';
  }

  return mapRunState(summary.status || null);
}

function buildCardSummary(task, summary) {
  if (!summary) {
    return 'No run prepared yet. Open the card, confirm provider login, and stage a candidate run.';
  }

  if (summary.synthesis?.status === 'completed') {
    const strategy = summary.synthesis.strategy || 'synthesis';
    const verification = summary.synthesis.verification?.status === 'pass' ? 'passed verification' : 'needs review';
    return `Latest ${strategy} workspace ${verification}. Review provenance and diff details before publishing.`;
  }

  if (summary.synthesis?.status === 'failed') {
    return 'The latest synthesis attempt failed. Inspect file selections, verification logs, and candidate provenance before retrying.';
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
    project_label: task.project_label,
    source_label: formatSourceLabel(task),
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
      review_policy: task.human_review_policy,
      merge_mode: task.run_config?.merge_mode || 'hybrid'
    }
  };
}

function formatSourceLabel(task) {
  if (task.source_system === 'symphony') {
    return task.source_task_id ? `Imported card ${task.source_task_id}` : 'Imported card';
  }
  if (task.source_system === 'manual') {
    return task.source_task_id ? `Manual task ${task.source_task_id}` : 'Manual task';
  }
  return task.source_task_id
    ? `${task.source_system} ${task.source_task_id}`
    : task.source_system;
}

function buildLatestRunOverview(task, summary) {
  const statusLabel = deriveRunDisplayState(summary || null);
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
    winner: summary?.evaluation?.decision?.winner || null,
    merge_mode: summary?.run_config?.merge_mode || task.run_config?.merge_mode || 'hybrid'
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

function buildComparisonView(evaluation, candidates) {
  const byCandidateId = new Map((evaluation?.candidates || []).map((candidate) => [candidate.candidate_id, candidate]));
  const rows = candidates.map((candidate) => {
    const evalCandidate = byCandidateId.get(candidate.candidate_id);
    const patchStats = evalCandidate?.metrics?.patch_stats
      || candidate.jj?.patch_stats
      || { file_count: candidate.changed_files?.length || 0, total_changed_lines: 0 };

    return {
      candidate_id: candidate.candidate_id,
      label: `${candidate.candidate_slot} / ${PROVIDER_LABELS[candidate.provider] || candidate.provider}`,
      provider: candidate.provider,
      provider_label: PROVIDER_LABELS[candidate.provider] || candidate.provider,
      candidate_slot: candidate.candidate_slot,
      status: candidate.status,
      verification_status: candidate.verification?.status || 'not_run',
      score: evalCandidate?.scorecard?.total ?? null,
      eligible: evalCandidate?.eligible ?? false,
      summary: evalCandidate?.summary || candidate.summary || 'No candidate summary yet.',
      changed_files: candidate.changed_files || [],
      changed_file_count: patchStats.file_count ?? candidate.changed_files?.length ?? 0,
      total_changed_lines: patchStats.total_changed_lines ?? 0,
      jj_change_id: candidate.jj?.candidate_revision?.change_id || candidate.jj?.working_revision?.change_id || null,
      jj_commit_id: candidate.jj?.candidate_revision?.commit_id || candidate.jj?.working_revision?.commit_id || null
    };
  });

  const contributionMap = evaluation?.contribution_map || {};
  const decision = evaluation?.decision
    ? {
        ...evaluation.decision,
        synthesis_summary: buildSynthesisSummary(evaluation.decision, contributionMap, rows)
      }
    : {
        mode: 'pending',
        summary: 'No evaluator decision is available yet.',
        card_summary: 'Evaluator has not run yet.',
        finalists: [],
        winner: null,
        synthesis_summary: 'Run live candidates and deterministic evaluation to populate compare and synthesis guidance.'
      };

  return {
    decision,
    contribution_map: materializeContributionMap(contributionMap, rows),
    rows
  };
}

function buildMergeView(summary, candidates, synthesis) {
  const candidateLabels = new Map(candidates.map((candidate) => [
    candidate.candidate_id,
    `${candidate.candidate_slot} / ${PROVIDER_LABELS[candidate.provider] || candidate.provider}`
  ]));
  const candidateDetails = new Map(candidates.map((candidate) => [candidate.candidate_id, candidate]));
  const evaluationByCandidateId = new Map((summary?.evaluation?.candidates || []).map((candidate) => [candidate.candidate_id, candidate]));
  const synthesizedByPath = new Map((synthesis?.selected_files || []).map((selection) => [selection.path, selection.candidate_id]));
  const byPath = new Map();

  for (const candidate of candidates) {
    for (const changedFile of candidate.changed_files || []) {
      if (!byPath.has(changedFile)) {
        byPath.set(changedFile, []);
      }
      const evaluation = evaluationByCandidateId.get(candidate.candidate_id);
      byPath.get(changedFile).push({
        candidate_id: candidate.candidate_id,
        label: candidateLabels.get(candidate.candidate_id),
        candidate_slot: candidate.candidate_slot,
        provider: candidate.provider,
        provider_label: PROVIDER_LABELS[candidate.provider] || candidate.provider,
        verification_status: candidate.verification?.status || 'not_run',
        score: evaluation?.scorecard?.total ?? null,
        eligible: evaluation?.eligible ?? false,
        jj_change_id: candidate.jj?.candidate_revision?.change_id || candidate.jj?.working_revision?.change_id || null
      });
    }
  }

  return {
    merge_mode: summary?.run_config?.merge_mode || 'hybrid',
    winner_candidate_id: summary?.evaluation?.decision?.winner_candidate_id || null,
    files: [...byPath.entries()]
      .map(([filePath, owners]) => ({
        path: filePath,
        owners,
        contested: owners.length > 1,
        synthesized_candidate_id: synthesizedByPath.get(filePath) || null,
        selection_reasons: Object.fromEntries(owners.map((owner) => [owner.candidate_id, buildSelectionReason({
          filePath,
          owner,
          owners,
          winnerCandidateId: summary?.evaluation?.decision?.winner_candidate_id || null,
          candidateDetails,
          synthesizedCandidateId: synthesizedByPath.get(filePath) || null
        })]))
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    synthesis: synthesis
      ? {
          synthesis_id: synthesis.synthesis_id,
          strategy: synthesis.strategy,
          status: synthesis.status,
          selected_by: synthesis.selected_by,
          verification: synthesis.verification,
          changed_files: synthesis.changed_files || synthesis.selected_files?.map((selection) => selection.path) || [],
          selected_candidates: (synthesis.selected_candidates || []).map((candidateId) => ({
            candidate_id: candidateId,
            label: candidateLabels.get(candidateId) || candidateId
          })),
          jj_change_id: synthesis.jj?.candidate_revision?.change_id || synthesis.jj?.working_revision?.change_id || null,
          patch_path: synthesis.artifact_paths?.patch_path || null,
          workspace_path: synthesis.workspace_path
        }
      : null
  };
}

function buildSynthesisSummary(decision, contributionMap, rows) {
  const byCandidateId = new Map(rows.map((row) => [row.candidate_id, row]));
  if (decision.mode === 'winner' && decision.winner_candidate_id) {
    const winner = byCandidateId.get(decision.winner_candidate_id);
    return winner
      ? `Start from ${winner.label} as the base candidate. Preserve its passing implementation unless later synthesis work finds a clearly stronger complementary patch.`
      : decision.rationale;
  }

  if (decision.mode === 'synthesize') {
    const finalists = (decision.finalist_candidate_ids || [])
      .map((candidateId) => byCandidateId.get(candidateId))
      .filter(Boolean)
      .map((candidate) => candidate.label)
      .join(', ');
    const strongest = contributionMap.top_score ? byCandidateId.get(contributionMap.top_score)?.label : null;
    return finalists
      ? `Synthesize across ${finalists}. ${strongest ? `Use ${strongest} as the likely base patch, then review the other finalists for better tests, tighter scope, or smaller diffs.` : 'Review finalist strengths before composing the merged change.'}`
      : decision.rationale;
  }

  if (decision.mode === 'no_winner') {
    return 'No candidate passed deterministic gates. Fix verification or authentication issues before attempting synthesis.';
  }

  return 'Comparison data is waiting on a completed evaluated run.';
}

function materializeContributionMap(contributionMap, rows) {
  const byCandidateId = new Map(rows.map((row) => [row.candidate_id, row]));
  return Object.fromEntries(Object.entries(contributionMap).map(([key, candidateId]) => {
    const row = candidateId ? byCandidateId.get(candidateId) : null;
    return [key, row ? row.label : null];
  }));
}

function buildSelectionReason({ owner, owners, winnerCandidateId, synthesizedCandidateId }) {
  if (synthesizedCandidateId && owner.candidate_id === synthesizedCandidateId) {
    return 'selected in latest synthesis';
  }

  if (owners.length === 1) {
    return 'only candidate touching this file';
  }

  if (winnerCandidateId && owner.candidate_id === winnerCandidateId) {
    return 'winner candidate';
  }

  if (owner.verification_status === 'pass' && owner.eligible) {
    return 'passing alternate candidate';
  }

  return 'manual review required';
}

function splitPatchByFile(patchText, changedFiles) {
  if (!patchText.trim()) {
    return changedFiles.map((filePath) => ({ path: filePath, patch: '' }));
  }

  const lines = patchText.split('\n');
  const sections = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (current) {
        sections.push(current);
      }
      current = {
        path: extractPatchPath(line),
        patchLines: [line]
      };
      continue;
    }

    if (!current) {
      continue;
    }
    current.patchLines.push(line);
  }

  if (current) {
    sections.push(current);
  }

  if (sections.length === 0) {
    return changedFiles.map((filePath) => ({ path: filePath, patch: patchText }));
  }

  return sections.map((section) => ({
    path: section.path,
    patch: section.patchLines.join('\n').trimEnd()
  }));
}

function extractPatchPath(diffHeader) {
  const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(diffHeader.trim());
  if (!match) {
    return 'unknown';
  }
  return match[2];
}
