import fs from 'node:fs/promises';
import path from 'node:path';

import { JjAdapter } from './jj.mjs';
import { runAcceptanceChecks } from './verify.mjs';

export async function synthesizeRun({
  runDir,
  task,
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

  const resolvedWinnerCandidateId = winnerCandidateId || summary.evaluation?.decision?.winner_candidate_id || null;
  const normalizedStrategy = strategy === 'file_select' ? 'file_select' : 'winner_only';
  const normalizedSelections = normalizeFileSelections({
    strategy: normalizedStrategy,
    fileSelections,
    winnerCandidateId: resolvedWinnerCandidateId,
    candidateById
  });

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
      provider_instance_id: candidate.provider_instance_id
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

function normalizeFileSelections({ strategy, fileSelections, winnerCandidateId, candidateById }) {
  if (strategy === 'winner_only') {
    const winner = winnerCandidateId ? candidateById.get(winnerCandidateId) : null;
    if (!winner) {
      throw new Error('Winner-only synthesis requires a valid winner candidate.');
    }
    return (winner.changed_files || []).map((filePath) => ({
      path: filePath,
      candidate_id: winner.candidate_id
    }));
  }

  const normalized = Object.entries(fileSelections || {})
    .filter(([, candidateId]) => candidateId)
    .map(([filePath, candidateId]) => ({
      path: filePath,
      candidate_id: candidateId
    }));

  if (normalized.length === 0) {
    throw new Error('File-select synthesis requires at least one file selection.');
  }

  for (const selection of normalized) {
    const candidate = candidateById.get(selection.candidate_id);
    if (!candidate) {
      throw new Error(`Invalid file selection candidate: ${selection.candidate_id}`);
    }
    if (!(candidate.changed_files || []).includes(selection.path)) {
      throw new Error(`Candidate ${selection.candidate_id} does not own selected path ${selection.path}`);
    }
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
