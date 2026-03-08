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
    publication: null,
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
  manifest.publication = await buildPublicationState({
    manifest,
    task,
    summary,
    jj
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
    publication_readiness: manifest.publication_readiness,
    publication: manifest.publication
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

export async function refreshPublicationState({ runDir, task }) {
  const { summary, summaryPath, manifest, manifestPath } = await readSynthesisState(runDir);
  const jj = new JjAdapter();

  manifest.publication_readiness = buildPublicationReadiness({
    manifest,
    mergePlan: manifest.merge_plan || summary?.synthesis?.merge_plan || summary?.evaluation?.merge_plan || null
  });
  manifest.publication = await buildPublicationState({
    manifest,
    task,
    summary,
    jj
  });

  summary.synthesis = {
    ...summary.synthesis,
    publication_readiness: manifest.publication_readiness,
    publication: manifest.publication
  };

  await Promise.all([
    fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8'),
    fs.writeFile(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8')
  ]);

  return manifest.publication;
}

export async function approvePublication({
  runDir,
  task,
  approvedBy = 'human',
  approvedAt = new Date().toISOString(),
  note = null
}) {
  const { summary, summaryPath, manifest, manifestPath } = await readSynthesisState(runDir);
  const jj = new JjAdapter();
  const currentPublication = manifest.publication || summary?.synthesis?.publication || null;

  manifest.publication_readiness = buildPublicationReadiness({
    manifest,
    mergePlan: manifest.merge_plan || summary?.synthesis?.merge_plan || summary?.evaluation?.merge_plan || null
  });
  manifest.publication = await buildPublicationState({
    manifest: {
      ...manifest,
      publication: {
        ...currentPublication,
        human_approved_at: approvedAt,
        human_approved_by: approvedBy,
        human_approval_note: note || null
      }
    },
    task,
    summary,
    jj
  });

  summary.synthesis = {
    ...summary.synthesis,
    publication_readiness: manifest.publication_readiness,
    publication: manifest.publication
  };

  await Promise.all([
    fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8'),
    fs.writeFile(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8')
  ]);

  return manifest.publication;
}

export async function pushPublication({
  runDir,
  task,
  remote = null,
  bookmark = null
}) {
  const { summary, summaryPath, manifest, manifestPath } = await readSynthesisState(runDir);
  const jj = new JjAdapter();
  const currentPublication = manifest.publication || summary?.synthesis?.publication || null;
  const mergePlan = manifest.merge_plan || summary?.synthesis?.merge_plan || summary?.evaluation?.merge_plan || null;

  manifest.publication_readiness = buildPublicationReadiness({
    manifest,
    mergePlan
  });
  manifest.publication = await buildPublicationState({
    manifest,
    task,
    summary,
    jj
  });

  if (!manifest.publication.ready) {
    throw new Error(`Synthesis is not publishable yet: ${manifest.publication.blockers.join(' ')}`);
  }
  if (manifest.publication.approval_required && !manifest.publication.human_approved_at) {
    throw new Error('Publication requires explicit human approval before any remote push step.');
  }

  const targetRemote = remote || manifest.publication.target_remote || 'origin';
  const targetBookmark = bookmark || manifest.publication.target_branch_or_bookmark;
  if (!targetBookmark) {
    throw new Error('No target branch or bookmark is available for publication push.');
  }

  const pushResult = await jj.pushBookmark({
    workspacePath: manifest.workspace_path,
    remote: targetRemote,
    bookmark: targetBookmark,
    revision: '@'
  });

  manifest.publication = await buildPublicationState({
    manifest: {
      ...manifest,
      publication: {
        ...manifest.publication,
        target_remote: targetRemote,
        target_branch_or_bookmark: targetBookmark,
        published_ref: pushResult.published_ref || `${targetRemote}/${targetBookmark}`,
        pushed_at: pushResult.pushed_at || null,
        push_result: pushResult
      }
    },
    task,
    summary,
    jj
  });

  summary.synthesis = {
    ...summary.synthesis,
    publication_readiness: manifest.publication_readiness,
    publication: manifest.publication
  };

  await Promise.all([
    fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8'),
    fs.writeFile(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8')
  ]);

  return manifest.publication;
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
  const hiddenManualOverrides = (manifest.selected_files || [])
    .filter((selection) => selection.manual_override)
    .filter((selection) => !manifest.contributions?.[selection.path]);
  if (hiddenManualOverrides.length > 0) {
    blockers.push(`${hiddenManualOverrides.length} manual override${hiddenManualOverrides.length === 1 ? '' : 's'} lack recorded provenance.`);
  }

  const ready = blockers.length === 0;
  return {
    ready,
    status: ready ? 'review_ready' : 'blocked',
    eligible_for_approval: ready,
    summary: ready
      ? 'Verification passed, jj diff capture succeeded, and the synthesis stack is reviewable.'
      : 'The synthesized result is not ready for publication yet.',
    blockers,
    required_actions: [
      'Review the synthesized diff against base.',
      'Review per-file provenance and manual overrides.',
      'Approve publication before any remote push step.',
      'Confirm jj stack shape is understandable before publishing.'
    ],
    checklist: [
      'Review the synthesized diff against base.',
      'Review per-file provenance and manual overrides.',
      'Confirm jj stack shape is understandable before publishing.'
    ]
  };
}

async function buildPublicationState({ manifest, task, summary, jj }) {
  const readiness = manifest.publication_readiness || buildPublicationReadiness({
    manifest,
    mergePlan: manifest.merge_plan || summary?.synthesis?.merge_plan || summary?.evaluation?.merge_plan || null
  });
  const previous = manifest.publication || summary?.synthesis?.publication || {};
  const publishPolicy = task?.publish_policy || 'manual';
  const approvalRequired = publishPolicy !== 'auto_if_high_confidence';
  const preview = await buildPublicationPreview({
    manifest,
    task,
    summary,
    jj,
    targetRemote: previous.target_remote || 'origin',
    targetRef: previous.target_branch_or_bookmark || null
  });

  let status = 'blocked';
  if (previous.push_result?.status === 'success' && previous.pushed_at) {
    status = 'pushed';
  } else if (previous.push_result?.status === 'failed') {
    status = 'publish_failed';
  } else if (!readiness.ready) {
    status = 'blocked';
  } else if (approvalRequired && !previous.human_approved_at) {
    status = 'awaiting_approval';
  } else {
    status = 'push_ready';
  }

  const requiredActions = [...readiness.required_actions];
  if (approvalRequired && !previous.human_approved_at && readiness.ready) {
    requiredActions.unshift('Record explicit human approval before any remote push step.');
  }
  if (status === 'push_ready') {
    requiredActions.unshift('Push the approved bookmark or branch to the configured remote.');
  }
  if (status === 'publish_failed') {
    requiredActions.unshift('Inspect the recorded push failure and retry only after correcting the remote or bookmark state.');
  }

  return {
    status,
    summary: summarizePublicationStatus(status),
    ready: readiness.ready,
    eligible_for_approval: readiness.eligible_for_approval,
    approval_required: approvalRequired,
    blockers: [...readiness.blockers],
    required_actions: uniqueStrings(requiredActions),
    human_approved_at: previous.human_approved_at || null,
    human_approved_by: previous.human_approved_by || null,
    human_approval_note: previous.human_approval_note || null,
    target_remote: preview.target_remote,
    target_branch_or_bookmark: preview.target_branch_or_bookmark,
    publish_preview: preview,
    published_ref: previous.published_ref || null,
    pushed_at: previous.pushed_at || null,
    push_result: previous.push_result || null,
    push_error: previous.push_result?.error || null
  };
}

async function buildPublicationPreview({ manifest, task, summary, jj, targetRemote, targetRef }) {
  const adapter = jj || new JjAdapter();
  const targetBranchOrBookmark = targetRef || adapter.suggestPublishRef({
    taskId: task?.task_id || manifest.task_id,
    synthesisId: manifest.synthesis_id
  });
  const patchStats = manifest.jj?.patch_stats || {
    file_count: manifest.changed_files?.length || 0,
    total_changed_lines: 0
  };
  let publicationStack = [];
  if (manifest.jj?.status === 'captured') {
    publicationStack = await adapter.readStackForPublication({
      workspacePath: manifest.workspace_path,
      maxDepth: Math.max((manifest.stack_shape?.groups || []).length, 1) + 2
    }).catch(() => []);
  }

  return {
    synthesis_id: manifest.synthesis_id,
    strategy: manifest.strategy,
    status: manifest.status,
    target_remote: targetRemote || 'origin',
    target_branch_or_bookmark: targetBranchOrBookmark,
    workspace_path: manifest.workspace_path,
    patch_path: manifest.artifact_paths?.patch_path || null,
    changed_file_count: patchStats.file_count ?? manifest.changed_files?.length ?? 0,
    changed_line_count: patchStats.total_changed_lines ?? 0,
    diff_summary: manifest.jj?.diff_summary || summarizePatchStats(patchStats),
    selected_candidates: (manifest.selected_candidates || []).map((candidateId) => ({
      candidate_id: candidateId,
      label: summarizeCandidateLabel(summary, candidateId)
    })),
    stack_group_count: (manifest.stack_shape?.groups || []).length,
    stack_groups: (manifest.stack_shape?.groups || []).map((group) => ({
      kind: group.kind,
      label: group.label || group.kind,
      file_count: group.files?.length || 0,
      files: group.files || [],
      jj_change_id: group.revision?.change_id || null,
      jj_commit_id: group.revision?.commit_id || null
    })),
    stack_revisions: publicationStack,
    jj_change_id: manifest.jj?.candidate_revision?.change_id || manifest.jj?.working_revision?.change_id || null
  };
}

async function readSynthesisState(runDir) {
  const summaryPath = path.join(runDir, 'run-summary.json');
  const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
  if (!summary?.synthesis?.manifest_path) {
    throw new Error(`No synthesis manifest is available for run ${runDir}`);
  }
  const manifestPath = summary.synthesis.manifest_path;
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  return { summaryPath, summary, manifestPath, manifest };
}

function summarizePublicationStatus(status) {
  switch (status) {
    case 'awaiting_approval':
      return 'Ready for explicit human approval before any remote publish step.';
    case 'push_ready':
      return 'Publication has been approved and is ready to push to the configured remote.';
    case 'pushed':
      return 'The shaped synthesis stack has already been pushed.';
    case 'publish_failed':
      return 'A publish attempt was recorded as failed. Review the stored push result before retrying.';
    case 'blocked':
    default:
      return 'This synthesis is not publishable yet.';
  }
}

function summarizePatchStats(patchStats) {
  if (!patchStats) {
    return 'No patch summary is available yet.';
  }
  return `${patchStats.file_count || 0} files changed, ${patchStats.total_changed_lines || 0} total changed lines`;
}

function summarizeCandidateLabel(summary, candidateId) {
  const candidate = (summary?.candidate_results || []).find((result) => result.candidate_id === candidateId);
  if (!candidate) {
    return candidateId;
  }
  return `${candidate.candidate_slot} / ${candidate.provider}`;
}

function uniqueStrings(values) {
  return [...new Set((values || []).filter(Boolean))];
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
