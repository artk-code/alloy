import fs from 'node:fs/promises';
import path from 'node:path';

import { JjAdapter } from './jj.mjs';
import { buildMergePlanFromSelections, materializeSelectionsFromMergePlan, validateMergePlan } from './merge-plan.mjs';
import { runAcceptanceChecks } from './verify.mjs';

export async function synthesizeRun({
  runDir,
  task,
  mergePlan = null,
  strategy = 'winner_only',
  winnerCandidateId = null,
  fileSelections = {},
  selectedBy = 'human'
}) {
  const summaryPath = path.join(runDir, 'run-summary.json');
  const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
  const candidates = await readCandidateManifests(runDir);
  const candidateById = new Map(candidates.map((candidate) => [candidate.candidate_id, candidate]));

  if (candidates.length === 0) {
    throw new Error('No candidate manifests are available for synthesis.');
  }

  const normalizedPlan = normalizeMergePlan({
    mergePlan,
    strategy,
    winnerCandidateId,
    fileSelections,
    evaluation: summary.evaluation || null,
    candidates
  });
  const normalizedSelections = materializeSelectionsFromMergePlan(normalizedPlan);
  const normalizedStrategy = normalizedPlan.mode === 'winner_only' ? 'winner_only' : 'file_select';

  const synthesisRoot = path.join(runDir, 'synthesis');
  const synthesisId = `synth_${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const synthesisDir = path.join(synthesisRoot, synthesisId);
  const workspacePath = path.join(synthesisDir, 'workspace');
  const artifactsDir = path.join(synthesisDir, 'artifacts');
  await fs.mkdir(workspacePath, { recursive: true });
  await fs.mkdir(artifactsDir, { recursive: true });

  if (!task.repo_path) {
    throw new Error('Task repo_path is required for synthesis.');
  }

  await seedWorkspace(task.repo_path, workspacePath);

  const jj = new JjAdapter();
  const jjState = await jj.bootstrapWorkspace({
    workspacePath,
    taskId: task.task_id,
    candidateId: synthesisId,
    candidateSlot: 'S',
    providerInstanceId: 'alloy-synthesis',
    baseRef: task.base_ref
  }).catch((error) => ({
    status: error.code === 'ENOENT' ? 'unavailable' : 'failed',
    error: error.message || String(error),
    initialized_at: new Date().toISOString()
  }));

  const contributionMap = {};
  for (const selection of normalizedSelections) {
    const candidate = candidateById.get(selection.candidate_id);
    if (!candidate) {
      throw new Error(`Unknown candidate selected for synthesis: ${selection.candidate_id}`);
    }
    await copyCandidatePath({
      sourceWorkspace: candidate.workspace_path,
      targetWorkspace: workspacePath,
      relativePath: selection.path
    });
    contributionMap[selection.path] = {
      candidate_id: candidate.candidate_id,
      candidate_slot: candidate.candidate_slot,
      provider: candidate.provider,
      provider_instance_id: candidate.provider_instance_id,
      decision_reason: normalizedPlan.file_decisions.find((decision) => decision.path === selection.path)?.decision_reason || null,
      confidence: normalizedPlan.file_decisions.find((decision) => decision.path === selection.path)?.confidence || null,
      risk_level: normalizedPlan.file_decisions.find((decision) => decision.path === selection.path)?.risk_level || null
    };
  }

  const verification = await runAcceptanceChecks({
    workspacePath,
    commands: task.acceptance_checks || [],
    outputDir: artifactsDir
  });

  const manifest = {
    synthesis_id: synthesisId,
    task_id: task.task_id,
    run_dir: runDir,
    strategy: normalizedStrategy,
    selected_by: selectedBy,
    created_at: new Date().toISOString(),
    workspace_path: workspacePath,
    merge_plan: normalizedPlan,
    selected_candidates: [...new Set(normalizedSelections.map((selection) => selection.candidate_id))],
    selected_files: normalizedSelections,
    contributions: contributionMap,
    verification,
    status: verification.status === 'pass' ? 'completed' : 'failed',
    jj: jjState,
    artifact_paths: {
      patch_path: path.join(artifactsDir, 'synthesis.patch'),
      diff_summary_path: path.join(artifactsDir, 'diff-summary.txt'),
      status_path: path.join(artifactsDir, 'jj-status.txt'),
      manifest_path: path.join(synthesisDir, 'manifest.json')
    }
  };

  if (jjState.status === 'ready') {
    try {
      const snapshot = await jj.captureCandidateSnapshot({
        workspacePath,
        description: `Alloy synthesis ${normalizedStrategy} for ${task.task_id}`,
        patchPath: manifest.artifact_paths.patch_path,
        diffSummaryPath: manifest.artifact_paths.diff_summary_path,
        statusPath: manifest.artifact_paths.status_path
      });
      manifest.jj = {
        ...jjState,
        ...snapshot
      };
      manifest.changed_files = snapshot.changed_files;
    } catch (error) {
      manifest.jj = {
        ...jjState,
        status: 'failed',
        error: error.message || String(error)
      };
      manifest.changed_files = [];
    }
  } else {
    manifest.changed_files = normalizedSelections.map((selection) => selection.path);
  }

  await fs.writeFile(manifest.artifact_paths.manifest_path, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  summary.synthesis = {
    synthesis_id: synthesisId,
    strategy: normalizedStrategy,
    selected_by: selectedBy,
    status: manifest.status,
    created_at: manifest.created_at,
    workspace_path: workspacePath,
    manifest_path: manifest.artifact_paths.manifest_path,
    selected_candidates: manifest.selected_candidates,
    selected_files: normalizedSelections,
    merge_plan: normalizedPlan,
    verification: manifest.verification,
    jj: manifest.jj
  };

  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');

  return manifest;
}

export async function readLatestSynthesis(runDir) {
  const summaryPath = path.join(runDir, 'run-summary.json');
  const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8').catch(() => 'null'));
  if (!summary?.synthesis?.manifest_path) {
    return null;
  }
  return JSON.parse(await fs.readFile(summary.synthesis.manifest_path, 'utf8'));
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

function normalizeMergePlan({ mergePlan, strategy, winnerCandidateId, fileSelections, evaluation, candidates }) {
  const normalized = mergePlan || buildMergePlanFromSelections({
    candidates,
    evaluation,
    strategy,
    winnerCandidateId,
    fileSelections
  });
  const validation = validateMergePlan({ mergePlan: normalized, candidates });

  if (!validation.ok) {
    throw new Error(`Invalid merge plan: ${validation.errors.join('; ')}`);
  }

  if (normalized.mode === 'no_winner') {
    throw new Error('Cannot synthesize with a no_winner merge plan.');
  }

  return normalized;
}

async function seedWorkspace(sourcePath, destinationPath) {
  const entries = await fs.readdir(sourcePath);
  for (const entry of entries) {
    await fs.cp(path.join(sourcePath, entry), path.join(destinationPath, entry), { recursive: true });
  }
}

async function copyCandidatePath({ sourceWorkspace, targetWorkspace, relativePath }) {
  const sourcePath = path.join(sourceWorkspace, relativePath);
  const targetPath = path.join(targetWorkspace, relativePath);
  const sourceStat = await fs.stat(sourcePath).catch(() => null);

  if (!sourceStat) {
    await fs.rm(targetPath, { recursive: true, force: true });
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.rm(targetPath, { recursive: true, force: true });
  await fs.cp(sourcePath, targetPath, { recursive: true });
}
