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
    const latestCandidates = latestRun ? await readCandidateManifests(latestRun.runDir) : [];
    const latestRunAudit = buildRunAudit({
      task: parsed.task,
      summary: latestRun?.summary || null,
      candidates: latestCandidates,
      runDir: latestRun?.runDir || null,
      matchedScope: latestRun?.matchedScope || null
    });
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
      state: deriveRunDisplayState(latestRun?.summary || null, latestRunAudit),
      latest_run: latestRun?.summary || null,
      run_dir: latestRun?.runDir || null,
      run_origin: latestRunAudit.origin,
      run_origin_label: latestRunAudit.origin_label,
      run_origin_detail: latestRunAudit.origin_detail,
      proof_level: latestRunAudit.proof_level,
      legacy_run: latestRunAudit.legacy_run,
      replay_backed: latestRunAudit.replay_backed,
      acceptance_summary: summarizeAcceptanceChecks(parsed.task.acceptance_checks),
      card_summary: buildCardSummary(parsed.task, latestRun?.summary || null, latestRunAudit),
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
    const latestRunAudit = buildRunAudit({
      task: parsed.task,
      summary: latestRun?.summary || null,
      candidates,
      runDir: latestRun?.runDir || null,
      matchedScope: latestRun?.matchedScope || null
    });
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
      judge_rationale: latestRun?.summary?.evaluation?.judge_rationale || null,
      latest_run_overview: buildLatestRunOverview(parsed.task, latestRun?.summary || null, latestRunAudit),
      comparison_view: buildComparisonView(latestRun?.summary?.evaluation || null, candidates),
      merge_view: buildMergeView(latestRun?.summary || null, candidates, synthesis),
      publication_view: buildPublicationView(latestRun?.summary || null, synthesis, parsed.task, candidates),
      compare_url: `/compare.html?task=${encodeURIComponent(taskId)}`,
      warnings: parsed.warnings,
      latest_run: latestRun?.summary || null,
      latest_run_audit: latestRunAudit,
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

export async function getSynthesisDiff(projectRoot, taskId) {
  const task = await findTaskById(projectRoot, taskId);
  const latestRun = task ? await findLatestRun(projectRoot, task.project_id, taskId) : null;
  if (!latestRun) {
    return null;
  }

  const synthesis = await readLatestSynthesisManifest(latestRun.summary);
  if (!synthesis) {
    return null;
  }

  const patchText = await fs.readFile(synthesis.artifact_paths.patch_path, 'utf8').catch(() => '');
  const diffSummary = await fs.readFile(synthesis.artifact_paths.diff_summary_path, 'utf8').catch(() => '');
  const filePatches = splitPatchByFile(patchText, synthesis.changed_files || synthesis.selected_files?.map((selection) => selection.path) || []);

  return {
    task_id: taskId,
    run_dir: latestRun.runDir,
    synthesis_id: synthesis.synthesis_id,
    strategy: synthesis.strategy,
    label: `Synthesis / ${synthesis.strategy}`,
    changed_files: synthesis.changed_files || [],
    diff_summary: diffSummary.trim(),
    patch: patchText,
    files: filePatches,
    verification: synthesis.verification || null,
    jj: synthesis.jj || null,
    merge_plan: synthesis.merge_plan || latestRun.summary?.evaluation?.merge_plan || null,
    contributions: synthesis.contributions || {},
    selected_files: synthesis.selected_files || [],
    stack_shape: synthesis.stack_shape || null,
    publication_readiness: synthesis.publication_readiness || null,
    publication: buildPublicationView(latestRun.summary || null, synthesis, task, await readCandidateManifests(latestRun.runDir))
  };
}

export async function getTaskPublication(projectRoot, taskId) {
  const task = await findTaskById(projectRoot, taskId);
  const latestRun = task ? await findLatestRun(projectRoot, task.project_id, taskId) : null;
  if (!latestRun) {
    return null;
  }

  const candidates = await readCandidateManifests(latestRun.runDir);
  const synthesis = await readLatestSynthesisManifest(latestRun.summary);
  return buildPublicationView(latestRun.summary, synthesis, task, candidates);
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
      return {
        runDir,
        summary,
        matchedScope: projectMatches.includes(runDir) ? 'project' : 'fallback'
      };
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

function deriveRunDisplayState(summary, audit = null) {
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
    if (audit?.origin === 'fixture_replay') {
      return 'Fixture Replay';
    }
    if (audit?.origin === 'legacy_artifact') {
      return 'Legacy Artifact';
    }
    if (audit?.verified_candidates > 0) {
      return 'Passing Candidates';
    }
    return 'Completed';
  }

  return mapRunState(summary.status || null);
}

function buildCardSummary(task, summary, audit = null) {
  if (!summary) {
    return 'No run prepared yet. Select the task, confirm provider login, and stage a candidate run.';
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
    if (audit?.origin === 'fixture_replay') {
      return 'This card is backed by a historical fixture replay run. Verification is real, but it does not prove live provider authoring.';
    }
    if (audit?.origin === 'legacy_artifact') {
      return 'This card is backed by a historical run artifact from an older schema. Inspect manifests and verification before trusting it as current product proof.';
    }
    if (audit?.verified_candidates > 0) {
      return `A completed candidate run verified ${audit.verified_candidates} candidate${audit.verified_candidates === 1 ? '' : 's'}, but no evaluator summary was captured.`;
    }
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

function buildLatestRunOverview(task, summary, audit = null) {
  const statusLabel = deriveRunDisplayState(summary || null, audit);
  const providerPlan = formatProviderLabels(task.providers).join(', ');
  const executionSummary = summary
    ? summarizeRunExecution(summary, audit)
    : 'No run has been prepared yet for this task.';
  const decisionSummary = summary?.evaluation?.decision?.summary
    || (summary?.status === 'dry-run'
      ? 'This card has only been prepared as a dry run. Provider commands were generated, but the CLIs were not launched from the UI.'
      : 'No evaluator decision is available yet.');

  return {
    status_label: statusLabel,
    execution_summary: executionSummary,
    decision_summary: decisionSummary,
    run_origin: audit?.origin || 'none',
    run_origin_label: audit?.origin_label || 'No run',
    run_origin_detail: audit?.origin_detail || 'No run evidence is available yet.',
    proof_level: audit?.proof_level || 'none',
    legacy_run: audit?.legacy_run || false,
    replay_backed: audit?.replay_backed || false,
    provider_plan: providerPlan,
    acceptance_summary: summarizeAcceptanceChecks(task.acceptance_checks),
    finalists: summary?.evaluation?.decision?.finalists || [],
    winner: summary?.evaluation?.decision?.winner || null,
    merge_mode: summary?.run_config?.merge_mode || task.run_config?.merge_mode || 'hybrid'
  };
}

function summarizeRunExecution(summary, audit = null) {
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
    if (audit?.origin === 'fixture_replay') {
      return `Completed ${results.length} fixture-backed candidate run${results.length === 1 ? '' : 's'} and verified ${verified}. This is useful plumbing proof, not live provider proof.`;
    }
    if (audit?.origin === 'legacy_artifact') {
      return `Loaded ${results.length} candidate result${results.length === 1 ? '' : 's'} from a historical artifact and verified ${verified}. Treat it as legacy evidence until rerun through the current pipeline.`;
    }
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
    merge_plan: materializeMergePlan(evaluation?.merge_plan || null, rows),
    judge_rationale: materializeJudgeRationale(evaluation?.judge_rationale || null, rows),
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
  const synthesizedSelectionsByPath = new Map((synthesis?.selected_files || []).map((selection) => [selection.path, selection]));
  const mergePlan = summary?.evaluation?.merge_plan || null;
  const planDecisionsByPath = new Map((mergePlan?.file_decisions || []).map((decision) => [decision.path, decision]));
  const unresolvedByPath = new Map((mergePlan?.unresolved_conflicts || []).map((conflict) => [conflict.path, conflict]));
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
    merge_plan: mergePlan
      ? {
          ...mergePlan,
          base_candidate_label: candidateLabels.get(mergePlan.base_candidate_id) || null
        }
      : null,
    judge_rationale: materializeJudgeRationale(summary?.evaluation?.judge_rationale || null, [...candidateLabels.entries()].map(([candidateId, label]) => ({
      candidate_id: candidateId,
      label
    }))),
    files: [...byPath.entries()]
      .map(([filePath, owners]) => ({
        path: filePath,
        owners,
        contested: owners.length > 1,
        planned_candidate_id: planDecisionsByPath.get(filePath)?.chosen_candidate_id || null,
        planned_candidate_label: candidateLabels.get(planDecisionsByPath.get(filePath)?.chosen_candidate_id) || null,
        planned_decision_reason: planDecisionsByPath.get(filePath)?.decision_reason || null,
        planned_confidence: planDecisionsByPath.get(filePath)?.confidence || null,
        planned_risk_level: planDecisionsByPath.get(filePath)?.risk_level || null,
        unresolved_conflict: unresolvedByPath.get(filePath) || null,
        synthesized_candidate_id: synthesizedByPath.get(filePath) || null,
        selected_candidate_id: synthesizedSelectionsByPath.get(filePath)?.candidate_id || null,
        selected_candidate_label: candidateLabels.get(synthesizedSelectionsByPath.get(filePath)?.candidate_id) || null,
        selection_origin: synthesizedSelectionsByPath.get(filePath)?.selection_origin || null,
        manual_override: synthesizedSelectionsByPath.get(filePath)?.manual_override || false,
        planned_matches_latest: synthesizedSelectionsByPath.get(filePath)
          ? synthesizedSelectionsByPath.get(filePath)?.planned_candidate_id === synthesizedSelectionsByPath.get(filePath)?.candidate_id
          : null,
        selection_reasons: Object.fromEntries(owners.map((owner) => [owner.candidate_id, buildSelectionReason({
          filePath,
          owner,
          owners,
          winnerCandidateId: summary?.evaluation?.decision?.winner_candidate_id || null,
          candidateDetails,
          synthesizedCandidateId: synthesizedByPath.get(filePath) || null,
          mergePlanDecision: planDecisionsByPath.get(filePath) || null
        })]))
      }))
      .sort(compareMergeFilesForReview),
    provenance_summary: buildSynthesisProvenanceSummary(synthesis, candidateLabels),
    publication_readiness: synthesis?.publication_readiness || null,
    publication: buildPublicationView(summary || null, synthesis, null, candidates),
    stack_shape: synthesis?.stack_shape || null,
    synthesis_summary: synthesis
      ? buildSynthesisSummaryCard(synthesis)
      : null,
    counts: {
      total_files: byPath.size,
      contested_files: [...byPath.keys()].filter((filePath) => (byPath.get(filePath) || []).length > 1).length,
      unresolved_conflicts: (mergePlan?.unresolved_conflicts || []).length,
      manual_overrides: (synthesis?.selected_files || []).filter((selection) => selection.manual_override).length
    },
    synthesis: synthesis
      ? {
          synthesis_id: synthesis.synthesis_id,
          strategy: synthesis.strategy,
          status: synthesis.status,
          selected_by: synthesis.selected_by,
          verification: synthesis.verification,
          changed_files: synthesis.changed_files || synthesis.selected_files?.map((selection) => selection.path) || [],
          merge_plan: synthesis.merge_plan || null,
          selected_candidates: (synthesis.selected_candidates || []).map((candidateId) => ({
            candidate_id: candidateId,
            label: candidateLabels.get(candidateId) || candidateId
          })),
          jj_change_id: synthesis.jj?.candidate_revision?.change_id || synthesis.jj?.working_revision?.change_id || null,
          patch_stats: synthesis.jj?.patch_stats || null,
          patch_path: synthesis.artifact_paths?.patch_path || null,
          workspace_path: synthesis.workspace_path,
          stack_shape: synthesis.stack_shape || null,
          publication_readiness: synthesis.publication_readiness || null
        }
      : null
  };
}

function buildPublicationView(summary, synthesis, task, candidates = []) {
  if (!synthesis) {
    return null;
  }

  const candidateLabels = new Map((candidates || []).map((candidate) => [
    candidate.candidate_id,
    `${candidate.candidate_slot} / ${PROVIDER_LABELS[candidate.provider] || candidate.provider}`
  ]));
  const publication = synthesis.publication || null;
  const readiness = synthesis.publication_readiness || null;
  const preview = publication?.publish_preview || null;

  return {
    status: publication?.status || (readiness?.ready ? 'awaiting_approval' : 'blocked'),
    summary: publication?.summary || readiness?.summary || 'Publication state is not available yet.',
    blockers: publication?.blockers || readiness?.blockers || [],
    required_actions: publication?.required_actions || readiness?.required_actions || readiness?.checklist || [],
    ready: publication?.ready ?? readiness?.ready ?? false,
    eligible_for_approval: publication?.eligible_for_approval ?? readiness?.eligible_for_approval ?? false,
    approval_required: publication?.approval_required ?? ((task?.publish_policy || 'manual') !== 'auto_if_high_confidence'),
    human_approved_at: publication?.human_approved_at || null,
    human_approved_by: publication?.human_approved_by || null,
    human_approval_note: publication?.human_approval_note || null,
    target_remote: publication?.target_remote || 'origin',
    target_branch_or_bookmark: publication?.target_branch_or_bookmark || preview?.target_branch_or_bookmark || null,
    published_ref: publication?.published_ref || null,
    pushed_at: publication?.pushed_at || null,
    push_error: publication?.push_error || publication?.push_result?.error || null,
    push_result: publication?.push_result || null,
    publish_preview: preview
      ? {
          ...preview,
          selected_candidates: (preview.selected_candidates || []).map((candidate) => ({
            ...candidate,
            label: candidate.label || candidateLabels.get(candidate.candidate_id) || candidate.candidate_id
          }))
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

function materializeMergePlan(mergePlan, rows) {
  if (!mergePlan) {
    return null;
  }

  const byCandidateId = new Map(rows.map((row) => [row.candidate_id, row]));
  return {
    ...mergePlan,
    base_candidate_label: mergePlan.base_candidate_id ? byCandidateId.get(mergePlan.base_candidate_id)?.label || mergePlan.base_candidate_id : null,
    file_decisions: (mergePlan.file_decisions || []).map((decision) => ({
      ...decision,
      chosen_candidate_label: byCandidateId.get(decision.chosen_candidate_id)?.label || decision.chosen_candidate_id,
      contender_labels: (decision.contender_candidate_ids || []).map((candidateId) => byCandidateId.get(candidateId)?.label || candidateId)
    })),
    unresolved_conflicts: (mergePlan.unresolved_conflicts || []).map((conflict) => ({
      ...conflict,
      contender_labels: (conflict.contender_candidate_ids || []).map((candidateId) => byCandidateId.get(candidateId)?.label || candidateId),
      recommended_candidate_label: conflict.recommended_candidate_id
        ? byCandidateId.get(conflict.recommended_candidate_id)?.label || conflict.recommended_candidate_id
        : null
    }))
  };
}

function materializeJudgeRationale(judgeRationale, rows) {
  if (!judgeRationale) {
    return null;
  }

  const byCandidateId = new Map((rows || []).map((row) => [row.candidate_id, row]));
  return {
    ...judgeRationale,
    winner_candidate_label: judgeRationale.winner_candidate_id
      ? byCandidateId.get(judgeRationale.winner_candidate_id)?.label || judgeRationale.winner_candidate_label
      : judgeRationale.winner_candidate_label,
    base_candidate_label: judgeRationale.base_candidate_id
      ? byCandidateId.get(judgeRationale.base_candidate_id)?.label || judgeRationale.base_candidate_label
      : judgeRationale.base_candidate_label,
    finalists: (judgeRationale.finalists || []).map((finalist) => ({
      ...finalist,
      label: byCandidateId.get(finalist.candidate_id)?.label || finalist.label
    })),
    strengths: (judgeRationale.strengths || []).map((strength) => ({
      ...strength,
      candidate_label: byCandidateId.get(strength.candidate_id)?.label || strength.candidate_label
    })),
    file_rationale: (judgeRationale.file_rationale || []).map((fileDecision) => ({
      ...fileDecision,
      chosen_candidate_label: byCandidateId.get(fileDecision.chosen_candidate_id)?.label || fileDecision.chosen_candidate_label,
      contender_labels: (fileDecision.contender_candidate_ids || []).map((candidateId) => byCandidateId.get(candidateId)?.label || candidateId)
    })),
    unresolved_conflicts: (judgeRationale.unresolved_conflicts || []).map((conflict) => ({
      ...conflict,
      contender_labels: (conflict.contender_candidate_ids || []).map((candidateId) => byCandidateId.get(candidateId)?.label || candidateId),
      recommended_candidate_label: conflict.recommended_candidate_id
        ? byCandidateId.get(conflict.recommended_candidate_id)?.label || conflict.recommended_candidate_label
        : conflict.recommended_candidate_label
    }))
  };
}

function buildSelectionReason({ owner, owners, winnerCandidateId, synthesizedCandidateId, mergePlanDecision }) {
  if (synthesizedCandidateId && owner.candidate_id === synthesizedCandidateId) {
    return 'selected in latest synthesis';
  }

  if (mergePlanDecision && owner.candidate_id === mergePlanDecision.chosen_candidate_id) {
    return `merge plan: ${mergePlanDecision.decision_reason}`;
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

function buildSynthesisSummaryCard(synthesis) {
  const patchStats = synthesis?.jj?.patch_stats || null;
  return {
    status: synthesis.status,
    strategy: synthesis.strategy,
    changed_file_count: patchStats?.file_count ?? synthesis?.changed_files?.length ?? 0,
    changed_line_count: patchStats?.total_changed_lines ?? 0,
    verification_status: synthesis?.verification?.status || 'not_run',
    jj_change_id: synthesis?.jj?.candidate_revision?.change_id || synthesis?.jj?.working_revision?.change_id || null
  };
}

function buildSynthesisProvenanceSummary(synthesis, candidateLabels) {
  return (synthesis?.selected_files || [])
    .map((selection) => ({
      path: selection.path,
      candidate_id: selection.candidate_id,
      candidate_label: candidateLabels.get(selection.candidate_id) || selection.candidate_id,
      selection_origin: selection.selection_origin || 'merge_plan',
      manual_override: Boolean(selection.manual_override),
      planned_candidate_id: selection.planned_candidate_id || null,
      planned_candidate_label: selection.planned_candidate_id
        ? candidateLabels.get(selection.planned_candidate_id) || selection.planned_candidate_id
        : null,
      file_kind: selection.file_kind || classifyFileKind(selection.path)
    }))
    .sort(compareMergeFilesForReview);
}

function compareMergeFilesForReview(left, right) {
  const leftPriority = priorityForMergeFile(left);
  const rightPriority = priorityForMergeFile(right);
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }
  return left.path.localeCompare(right.path);
}

function priorityForMergeFile(file) {
  if (file.unresolved_conflict) {
    return 0;
  }
  if (file.manual_override) {
    return 1;
  }
  if (file.contested) {
    return 2;
  }
  return 3;
}

function classifyFileKind(filePath) {
  if (/(^|\/)(test|tests|spec|specs|__tests__)(\/|$)|\.(test|spec)\.[^.]+$/i.test(filePath)) {
    return 'test';
  }
  if (/(^|\/)(docs?|notes?|adr)(\/|$)|\.(md|mdx|txt)$/i.test(filePath)) {
    return 'doc';
  }
  return 'code';
}

function buildRunAudit({ task, summary, candidates, runDir, matchedScope }) {
  const candidateList = Array.isArray(candidates) ? candidates : [];
  const summaryResults = Array.isArray(summary?.candidate_results) ? summary.candidate_results : [];
  const verifiedCandidates = candidateList.length > 0
    ? candidateList.filter((candidate) => candidate.verification?.status === 'pass').length
    : summaryResults.filter((candidate) => candidate.verification?.status === 'pass').length;
  const replayBacked = candidateList.some(isFixtureReplayCandidate);
  const liveCli = candidateList.some(isLiveCliCandidate);
  const currentSchema = Boolean(summary?.project_id && summary?.run_config)
    || candidateList.some((candidate) => candidate.candidate_key || candidate.provider_instance_id || candidate.artifact_paths?.evaluation_path);
  const legacyRun = Boolean(summary) && (
    matchedScope === 'fallback'
    || (!currentSchema && summary.status === 'completed')
  );

  if (!summary) {
    return {
      origin: 'none',
      origin_label: 'No Run',
      origin_detail: 'No run artifact is available for this card yet.',
      proof_level: 'none',
      verified_candidates: 0,
      replay_backed: false,
      legacy_run: false
    };
  }

  if (summary.status === 'prepared' || summary.status === 'dry-run') {
    return {
      origin: 'preview',
      origin_label: summary.status === 'prepared' ? 'Prepared Workspace' : 'Command Preview',
      origin_detail: 'This run only prepared workspaces and command launch data. No provider CLI execution was captured.',
      proof_level: 'preview',
      verified_candidates: 0,
      replay_backed: false,
      legacy_run: false
    };
  }

  if (replayBacked) {
    return {
      origin: 'fixture_replay',
      origin_label: 'Fixture Replay',
      origin_detail: 'At least one candidate manifest executed a local replay or mock fixture instead of a provider CLI.',
      proof_level: 'replay',
      verified_candidates: verifiedCandidates,
      replay_backed: true,
      legacy_run: legacyRun
    };
  }

  if (liveCli) {
    return {
      origin: 'live_cli',
      origin_label: 'Live CLI Run',
      origin_detail: 'Candidate manifests show real provider CLI commands and captured session artifacts.',
      proof_level: 'live',
      verified_candidates: verifiedCandidates,
      replay_backed: false,
      legacy_run
    };
  }

  if (legacyRun) {
    return {
      origin: 'legacy_artifact',
      origin_label: 'Legacy Artifact',
      origin_detail: 'This run artifact predates the current project-scoped schema or evaluator flow.',
      proof_level: 'legacy',
      verified_candidates: verifiedCandidates,
      replay_backed: false,
      legacy_run: true
    };
  }

  return {
    origin: 'artifact_only',
    origin_label: 'Artifact Run',
    origin_detail: 'The run artifact has candidate results, but Alloy could not prove whether they came from live provider execution or a replay helper.',
    proof_level: 'artifact',
    verified_candidates: verifiedCandidates,
    replay_backed: false,
    legacy_run: false
  };
}

function isFixtureReplayCandidate(candidate) {
  const binary = String(candidate?.command?.binary || '');
  const docs = String(candidate?.command?.docs || '');
  const args = Array.isArray(candidate?.command?.args) ? candidate.command.args.map(String) : [];
  const haystack = [binary, docs, ...args].join(' ');
  return /mock-provider\.mjs/i.test(haystack)
    || /replay-file\.mjs/i.test(haystack)
    || /example\.test\/mock-provider/i.test(haystack)
    || /fixtures\//i.test(haystack);
}

function isLiveCliCandidate(candidate) {
  const provider = String(candidate?.provider || '');
  const binary = path.basename(String(candidate?.command?.binary || ''));
  const docs = String(candidate?.command?.docs || '');
  const sessionRecordPath = String(candidate?.session_record_path || '');

  if (provider === 'codex' && (binary === 'codex' || docs.includes('developers.openai.com/codex/cli'))) {
    return true;
  }
  if (provider === 'claude-code' && (binary === 'claude' || docs.includes('code.claude.com/docs'))) {
    return true;
  }
  if (provider === 'gemini' && (binary === 'gemini' || docs.includes('google-gemini/gemini-cli'))) {
    return true;
  }
  return Boolean(sessionRecordPath && sessionRecordPath.includes(path.join('runtime', 'sessions')));
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
