export function buildJudgeRationale({
  taskId,
  evaluatedAt,
  candidates,
  decision,
  mergePlan,
  contributionMap
}) {
  const candidatesById = new Map((candidates || []).map((candidate) => [candidate.candidate_id, candidate]));
  const winner = decision?.winner_candidate_id ? candidatesById.get(decision.winner_candidate_id) || null : null;
  const baseCandidate = mergePlan?.base_candidate_id ? candidatesById.get(mergePlan.base_candidate_id) || null : null;
  const finalists = (decision?.finalist_candidate_ids || [])
    .map((candidateId) => candidatesById.get(candidateId))
    .filter(Boolean)
    .map((candidate) => ({
      candidate_id: candidate.candidate_id,
      label: formatCandidateLabel(candidate),
      score: candidate.scorecard?.total ?? 0,
      eligible: candidate.eligible,
      summary: candidate.summary
    }));

  const strengths = buildStrengths(contributionMap, candidatesById);
  const fileRationale = (mergePlan?.file_decisions || []).map((fileDecision) => ({
    path: fileDecision.path,
    chosen_candidate_id: fileDecision.chosen_candidate_id,
    chosen_candidate_label: labelFor(candidatesById, fileDecision.chosen_candidate_id),
    contender_candidate_ids: fileDecision.contender_candidate_ids || [],
    contender_labels: (fileDecision.contender_candidate_ids || []).map((candidateId) => labelFor(candidatesById, candidateId)),
    contested: (fileDecision.contender_candidate_ids || []).length > 1,
    decision_reason: fileDecision.decision_reason,
    risk_level: fileDecision.risk_level,
    confidence: fileDecision.confidence
  }));
  const unresolvedConflicts = (mergePlan?.unresolved_conflicts || []).map((conflict) => ({
    path: conflict.path,
    contender_candidate_ids: conflict.contender_candidate_ids || [],
    contender_labels: (conflict.contender_candidate_ids || []).map((candidateId) => labelFor(candidatesById, candidateId)),
    recommended_candidate_id: conflict.recommended_candidate_id || null,
    recommended_candidate_label: conflict.recommended_candidate_id
      ? labelFor(candidatesById, conflict.recommended_candidate_id)
      : null,
    reason: conflict.reason
  }));

  return {
    task_id: taskId,
    evaluated_at: evaluatedAt,
    mode: decision?.mode || 'pending',
    confidence: decision?.confidence || mergePlan?.confidence || 'low',
    overview: buildOverview({ decision, winner, baseCandidate, unresolvedConflicts }),
    next_action: buildNextAction({ decision, mergePlan, unresolvedConflicts }),
    winner_candidate_id: winner?.candidate_id || null,
    winner_candidate_label: winner ? formatCandidateLabel(winner) : null,
    base_candidate_id: baseCandidate?.candidate_id || null,
    base_candidate_label: baseCandidate ? formatCandidateLabel(baseCandidate) : null,
    finalists,
    strengths,
    risk_flags: buildRiskFlags({ decision, mergePlan, unresolvedConflicts, candidates }),
    file_rationale: fileRationale,
    unresolved_conflicts: unresolvedConflicts,
    operator_guidance: buildOperatorGuidance({ decision, mergePlan, unresolvedConflicts })
  };
}

function buildStrengths(contributionMap, candidatesById) {
  const reasonByKind = {
    top_score: 'highest deterministic score',
    smallest_patch: 'smallest deterministic diff footprint',
    narrowest_scope: 'fewest changed files',
    best_path_discipline: 'strongest path discipline'
  };

  return Object.entries(contributionMap || {})
    .filter(([, candidateId]) => candidateId && candidatesById.has(candidateId))
    .map(([kind, candidateId]) => ({
      kind,
      label: humanizeStrength(kind),
      candidate_id: candidateId,
      candidate_label: labelFor(candidatesById, candidateId),
      reason: reasonByKind[kind] || 'notable deterministic strength'
    }));
}

function buildOverview({ decision, winner, baseCandidate, unresolvedConflicts }) {
  if (decision?.mode === 'winner' && winner) {
    return `${formatCandidateLabel(winner)} is the current deterministic leader. ${decision.rationale}`;
  }
  if (decision?.mode === 'synthesize') {
    const baseLabel = baseCandidate ? formatCandidateLabel(baseCandidate) : 'the leading finalist';
    return unresolvedConflicts.length > 0
      ? `Synthesis is justified, but ${unresolvedConflicts.length} contested file${unresolvedConflicts.length === 1 ? '' : 's'} still need explicit review. Start from ${baseLabel}.`
      : `Synthesis is justified. Start from ${baseLabel} and keep the deterministic merge plan as the default composition guide.`;
  }
  if (decision?.mode === 'no_winner') {
    return 'No candidate passed deterministic gates. Fix verification, auth, or scope issues before attempting a merge.';
  }
  return decision?.rationale || 'Judge rationale is waiting on a completed evaluation.';
}

function buildNextAction({ decision, mergePlan, unresolvedConflicts }) {
  if (decision?.mode === 'winner' && mergePlan?.mode === 'winner_only') {
    return 'Review the winner diff, then finalize the whole candidate if the patch remains acceptable to a human reviewer.';
  }
  if (decision?.mode === 'synthesize' && unresolvedConflicts.length > 0) {
    return 'Review contested files first, confirm or override the merge plan selections, then build a fresh synthesis workspace.';
  }
  if (decision?.mode === 'synthesize') {
    return 'Use the merge plan as the default file allocation, build the synthesis workspace, and rerun full verification.';
  }
  if (decision?.mode === 'no_winner') {
    return 'Do not merge anything yet. Repair the failing candidates or rerun the task after fixing provider/auth issues.';
  }
  return 'Inspect the candidate results before proceeding.';
}

function buildRiskFlags({ decision, mergePlan, unresolvedConflicts, candidates }) {
  const flags = [];
  if (decision?.mode === 'no_winner') {
    flags.push({
      severity: 'high',
      message: 'No candidate is eligible for safe publication.'
    });
  }

  if (unresolvedConflicts.length > 0) {
    flags.push(...unresolvedConflicts.map((conflict) => ({
      severity: 'high',
      path: conflict.path,
      message: conflict.reason
    })));
  }

  const failedCandidates = (candidates || []).filter((candidate) => !candidate.eligible);
  if (failedCandidates.length > 0) {
    flags.push({
      severity: decision?.mode === 'winner' ? 'medium' : 'low',
      message: `${failedCandidates.length} candidate${failedCandidates.length === 1 ? '' : 's'} failed deterministic gates and should not contribute code without explicit human review.`
    });
  }

  if ((mergePlan?.file_decisions || []).some((decisionItem) => decisionItem.risk_level === 'high')) {
    flags.push({
      severity: 'medium',
      message: 'At least one selected file is high risk and should be reviewed before synthesis is treated as publishable.'
    });
  }

  return dedupeFlags(flags);
}

function buildOperatorGuidance({ decision, mergePlan, unresolvedConflicts }) {
  const guidance = [];
  if (decision?.mode === 'winner') {
    guidance.push('Inspect the winner diff before trusting the deterministic score alone.');
    guidance.push('Prefer whole-candidate finalization unless another candidate contributes clearly better tests or documentation.');
  } else if (decision?.mode === 'synthesize') {
    guidance.push('Review the merge plan before overriding any file assignments.');
    guidance.push('Keep synthesis file-level unless you have a concrete reason to split deeper.');
  } else {
    guidance.push('Do not create a synthesis workspace until at least one candidate passes deterministic gates.');
  }

  if (unresolvedConflicts.length > 0) {
    guidance.push('Resolve contested files before treating the synthesis result as review-ready.');
  }

  if (mergePlan?.verification_expectation) {
    guidance.push(`After merge, rerun ${mergePlan.verification_expectation.replaceAll('_', ' ')}.`);
  }

  return [...new Set(guidance)];
}

function dedupeFlags(flags) {
  const seen = new Set();
  return flags.filter((flag) => {
    const key = `${flag.severity}:${flag.path || ''}:${flag.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function labelFor(candidatesById, candidateId) {
  const candidate = candidatesById.get(candidateId);
  return candidate ? formatCandidateLabel(candidate) : candidateId;
}

function formatCandidateLabel(candidate) {
  return `${candidate.candidate_slot} / ${candidate.provider}`;
}

function humanizeStrength(kind) {
  return kind.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
}
