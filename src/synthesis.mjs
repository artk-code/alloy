import fs from 'node:fs/promises';
import path from 'node:path';

import { JjAdapter } from './jj.mjs';
import { buildMergePlanFromSelections, classifyFilePath, materializeSelectionsFromMergePlan, validateMergePlan } from './merge-plan.mjs';
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
  const normalizedSelections = buildSelectedFiles({
    normalizedPlan,
    baselinePlan: summary.evaluation?.merge_plan || null,
    strategy: normalizedPlan.mode,
    selectedBy
  });
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
      selection_origin: selection.selection_origin,
      manual_override: selection.manual_override,
      planned_candidate_id: selection.planned_candidate_id,
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
    stack_shape: {
      status: 'not_attempted',
      rationale: 'Stack shaping runs only when jj capture is available.'
    },
    publication_readiness: null,
    artifact_paths: {
      patch_path: path.join(artifactsDir, 'synthesis.patch'),
      diff_summary_path: path.join(artifactsDir, 'diff-summary.txt'),
      status_path: path.join(artifactsDir, 'jj-status.txt'),
      manifest_path: path.join(synthesisDir, 'manifest.json')
    }
  };

  if (jjState.status === 'ready') {
    try {
      await jj.run(['describe', '-m', `Alloy synthesis ${normalizedStrategy} for ${task.task_id}`], { cwd: workspacePath });
      manifest.stack_shape = await shapeSynthesisStack({
        jj,
        workspacePath,
        selectedFiles: normalizedSelections
      });
      const snapshot = await jj.captureDiffRange({
        workspacePath,
        fromRev: jjState.base_revision.commit_id,
        toRev: '@',
        patchPath: manifest.artifact_paths.patch_path,
        diffSummaryPath: manifest.artifact_paths.diff_summary_path,
        statusPath: manifest.artifact_paths.status_path,
        role: 'synthesis'
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

  manifest.publication_readiness = buildPublicationReadiness({
    manifest,
    mergePlan: normalizedPlan
  });

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
    jj: manifest.jj,
    stack_shape: manifest.stack_shape,
    publication_readiness: manifest.publication_readiness
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

function buildSelectedFiles({ normalizedPlan, baselinePlan, strategy, selectedBy }) {
  const baselineByPath = new Map((baselinePlan?.file_decisions || []).map((decision) => [decision.path, decision]));
  const chosenSelections = materializeSelectionsFromMergePlan(normalizedPlan);

  return chosenSelections.map((selection) => {
    const baselineDecision = baselineByPath.get(selection.path) || null;
    const manualOverride = strategy !== 'winner_only'
      && Boolean(baselineDecision)
      && baselineDecision.chosen_candidate_id !== selection.candidate_id;
    return {
      ...selection,
      planned_candidate_id: baselineDecision?.chosen_candidate_id || null,
      selection_origin: strategy === 'winner_only'
        ? 'winner_only'
        : manualOverride
          ? 'manual_override'
          : 'merge_plan',
      manual_override: manualOverride,
      selected_by: selectedBy,
      file_kind: classifyFilePath(selection.path)
    };
  });
}

async function shapeSynthesisStack({ jj, workspacePath, selectedFiles }) {
  const grouped = groupSelectedFiles(selectedFiles);
  const availableGroups = STACK_GROUP_ORDER
    .map((kind) => grouped.get(kind))
    .filter((group) => group && group.files.length > 0);

  if (availableGroups.length <= 1) {
    return {
      status: 'not_needed',
      ordering: STACK_GROUP_ORDER,
      groups: availableGroups.map((group) => ({
        kind: group.kind,
        label: group.label,
        files: [...group.files]
      })),
      operations: [],
      tip_revision: await jj.readRevision({ workspacePath, revset: '@' })
    };
  }

  const operations = [];
  const testsGroup = grouped.get('test');
  if (testsGroup?.files.length) {
    await jj.splitRevisionByFiles({
      workspacePath,
      revision: '@',
      files: testsGroup.files,
      message: 'Alloy synthesis: tests'
    });
    operations.push({
      command: 'split',
      kind: 'test',
      files: [...testsGroup.files]
    });
  }

  const docsGroup = grouped.get('doc');
  const implementationGroup = grouped.get('code');
  if (docsGroup?.files.length) {
    await jj.splitRevisionByFiles({
      workspacePath,
      revision: '@',
      files: docsGroup.files,
      message: 'Alloy synthesis: docs'
    });
    operations.push({
      command: 'split',
      kind: 'doc',
      files: [...docsGroup.files]
    });

    if (implementationGroup?.files.length) {
      await jj.rebaseRevisionAfter({ workspacePath, revision: '@-', destination: '@' });
      operations.push({
        command: 'rebase',
        kind: 'doc',
        destination: 'after implementation'
      });
      await jj.editRevision({ workspacePath, revision: '@+' });
      operations.push({
        command: 'edit',
        revision: '@+'
      });
    }
  }

  const presentKinds = availableGroups.map((group) => group.kind);
  const stackGroups = [];
  for (let index = 0; index < presentKinds.length; index += 1) {
    const reverseIndex = presentKinds.length - 1 - index;
    const kind = presentKinds[reverseIndex];
    const revset = index === 0 ? '@' : `@${'-'.repeat(index)}`;
    const group = grouped.get(kind);
    stackGroups.unshift({
      kind: group.kind,
      label: group.label,
      files: [...group.files],
      revision: await jj.readRevision({ workspacePath, revset })
    });
  }

  return {
    status: 'shaped',
    ordering: presentKinds,
    operations,
    groups: stackGroups,
    tip_revision: await jj.readRevision({ workspacePath, revset: '@' }),
    publication_note: 'Stack shaped for review using file-category commits.'
  };
}

function groupSelectedFiles(selectedFiles) {
  const groups = new Map(STACK_GROUP_ORDER.map((kind) => [kind, {
    kind,
    label: STACK_GROUP_LABELS[kind],
    files: []
  }]));

  for (const selection of selectedFiles) {
    const group = groups.get(selection.file_kind || 'code') || groups.get('code');
    group.files.push(selection.path);
  }

  for (const group of groups.values()) {
    group.files.sort((left, right) => left.localeCompare(right));
  }

  return groups;
}

function buildPublicationReadiness({ manifest, mergePlan }) {
  const blockers = [];
  if (manifest.verification?.status !== 'pass') {
    blockers.push('Verification did not pass for the synthesized result.');
  }
  if ((mergePlan?.unresolved_conflicts || []).length > 0) {
    blockers.push(`${mergePlan.unresolved_conflicts.length} unresolved merge conflict${mergePlan.unresolved_conflicts.length === 1 ? '' : 's'} remain.`);
  }
  if (manifest.jj?.status !== 'captured') {
    blockers.push('The final synthesis diff is not fully captured in jj artifacts.');
  }
  if (manifest.stack_shape?.status === 'failed') {
    blockers.push('The synthesis stack could not be shaped into reviewable jj commits.');
  }

  const ready = blockers.length === 0;
  return {
    ready,
    status: ready ? 'review_ready' : 'blocked',
    summary: ready
      ? 'Verification passed, jj diff capture succeeded, and the synthesis stack is reviewable.'
      : 'The synthesized result is not ready for publication yet.',
    blockers,
    checklist: [
      'Review the synthesized diff against base.',
      'Review per-file provenance and manual overrides.',
      'Confirm jj stack shape is understandable before publishing.'
    ]
  };
}

const STACK_GROUP_ORDER = ['test', 'code', 'doc'];
const STACK_GROUP_LABELS = {
  test: 'Tests',
  code: 'Implementation',
  doc: 'Docs'
};

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
