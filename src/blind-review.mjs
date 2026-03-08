export function buildBlindJudgePacket({
  task,
  evaluatedAt,
  candidates,
  ranking,
  pairwisePreferences,
  decision,
  mergePlan,
  judgeRationale,
  contributionMap
}) {
  const aliases = buildAliasMap(candidates);
  const rankedByCandidateId = new Map((ranking || []).map((candidateId, index) => [candidateId, index + 1]));
  const byCandidateId = new Map((candidates || []).map((candidate) => [candidate.candidate_id, candidate]));

  return {
    task_id: task.task_id,
    evaluated_at: evaluatedAt,
    task_summary: {
      title: task.title || task.task_id,
      objective: task.context || task.title || task.task_id,
      requirements: task.requirements || [],
      constraints: task.constraints || [],
      acceptance_checks: task.acceptance_checks || []
    },
    candidates: (candidates || [])
      .map((candidate) => {
        const alias = aliases.get(candidate.candidate_id);
        return {
          candidate_id: candidate.candidate_id,
          blind_id: alias.blind_id,
          label: alias.label,
          rank: rankedByCandidateId.get(candidate.candidate_id) || null,
          eligible: candidate.eligible,
          verification_status: candidate.verification_status,
          score: candidate.scorecard?.total ?? null,
          changed_file_count: candidate.metrics?.changed_file_count ?? candidate.changed_files?.length ?? 0,
          total_changed_lines: candidate.metrics?.patch_stats?.total_changed_lines ?? 0,
          changed_files: candidate.changed_files || [],
          summary: buildBlindCandidateSummary(candidate)
        };
      })
      .sort((left, right) => (left.rank || 99) - (right.rank || 99) || left.label.localeCompare(right.label)),
    ranking: (ranking || []).map((candidateId) => blindRef(aliases, candidateId)),
    pairwise_preferences: (pairwisePreferences || []).map((pair) => ({
      left_candidate_id: pair.left_candidate_id,
      left_blind_id: blindRef(aliases, pair.left_candidate_id).blind_id,
      left_label: blindRef(aliases, pair.left_candidate_id).label,
      right_candidate_id: pair.right_candidate_id,
      right_blind_id: blindRef(aliases, pair.right_candidate_id).blind_id,
      right_label: blindRef(aliases, pair.right_candidate_id).label,
      preferred_candidate_id: pair.preferred_candidate_id,
      preferred_blind_id: blindRef(aliases, pair.preferred_candidate_id).blind_id,
      preferred_label: blindRef(aliases, pair.preferred_candidate_id).label,
      reason: sanitizeText(pair.reason, candidates, aliases)
    })),
    decision: {
      mode: decision?.mode || 'pending',
      confidence: decision?.confidence || 'low',
      summary: sanitizeText(decision?.summary || 'No decision available.', candidates, aliases),
      card_summary: sanitizeText(decision?.card_summary || 'No decision available.', candidates, aliases),
      winner: decision?.winner_candidate_id ? blindRef(aliases, decision.winner_candidate_id) : null,
      finalists: (decision?.finalists || []).map((finalist) => ({
        ...blindRef(aliases, finalist.candidate_id),
        score: finalist.score,
        eligible: finalist.eligible
      }))
    },
    merge_scope: {
      base_candidate: mergePlan?.base_candidate_id ? blindRef(aliases, mergePlan.base_candidate_id) : null,
      file_decisions: (mergePlan?.file_decisions || []).map((fileDecision) => ({
        path: fileDecision.path,
        chosen_candidate: blindRef(aliases, fileDecision.chosen_candidate_id),
        contenders: (fileDecision.contender_candidate_ids || []).map((candidateId) => blindRef(aliases, candidateId)),
        decision_reason: sanitizeText(fileDecision.decision_reason, candidates, aliases),
        risk_level: fileDecision.risk_level,
        confidence: fileDecision.confidence
      })),
      unresolved_conflicts: (mergePlan?.unresolved_conflicts || []).map((conflict) => ({
        path: conflict.path,
        contenders: (conflict.contender_candidate_ids || []).map((candidateId) => blindRef(aliases, candidateId)),
        recommended_candidate: conflict.recommended_candidate_id
          ? blindRef(aliases, conflict.recommended_candidate_id)
          : null,
        reason: sanitizeText(conflict.reason, candidates, aliases)
      }))
    },
    guidance: {
      overview: sanitizeText(judgeRationale?.overview || decision?.summary || '', candidates, aliases),
      next_action: sanitizeText(judgeRationale?.next_action || '', candidates, aliases),
      strengths: (judgeRationale?.strengths || []).map((strength) => ({
        kind: strength.kind,
        label: strength.label,
        candidate: blindRef(aliases, strength.candidate_id),
        reason: sanitizeText(strength.reason, candidates, aliases)
      })),
      risk_flags: (judgeRationale?.risk_flags || []).map((flag) => ({
        severity: flag.severity,
        path: flag.path || null,
        message: sanitizeText(flag.message, candidates, aliases)
      })),
      operator_guidance: (judgeRationale?.operator_guidance || []).map((line) => sanitizeText(line, candidates, aliases)),
      top_score: contributionMap?.top_score ? blindRef(aliases, contributionMap.top_score) : null
    },
    alias_map: Object.fromEntries((candidates || []).map((candidate) => {
      const alias = aliases.get(candidate.candidate_id);
      return [candidate.candidate_id, {
        blind_id: alias.blind_id,
        label: alias.label
      }];
    }))
  };
}

export function buildComposerPlan({ blindJudgePacket, mergePlan, judgeRationale }) {
  const unresolvedConflicts = blindJudgePacket?.merge_scope?.unresolved_conflicts || [];
  const finalists = blindJudgePacket?.decision?.finalists || [];
  const winner = blindJudgePacket?.decision?.winner || null;
  const baseCandidate = blindJudgePacket?.merge_scope?.base_candidate || winner || null;
  const mode = deriveComposerMode(mergePlan);
  const reviewRequired = mode !== 'winner_finalize'
    || unresolvedConflicts.length > 0
    || (mergePlan?.confidence || 'low') !== 'high';

  return {
    task_id: blindJudgePacket?.task_id || null,
    evaluated_at: blindJudgePacket?.evaluated_at || null,
    mode,
    confidence: mergePlan?.confidence || blindJudgePacket?.decision?.confidence || 'low',
    summary: buildComposerSummary({ mode, baseCandidate, unresolvedConflicts, judgeRationale }),
    review_required: reviewRequired,
    base_candidate: baseCandidate,
    finalists,
    file_allocations: (blindJudgePacket?.merge_scope?.file_decisions || []).map((decision) => ({
      path: decision.path,
      chosen_candidate: decision.chosen_candidate,
      contenders: decision.contenders,
      decision_reason: decision.decision_reason,
      risk_level: decision.risk_level,
      confidence: decision.confidence,
      contested: (decision.contenders || []).length > 1
    })),
    unresolved_conflicts: unresolvedConflicts,
    operator_steps: buildComposerSteps({ mode, unresolvedConflicts, judgeRationale })
  };
}

function buildAliasMap(candidates = []) {
  const ordered = [...candidates].sort((left, right) => left.candidate_slot.localeCompare(right.candidate_slot));
  return new Map(ordered.map((candidate, index) => {
    const letter = String.fromCharCode(65 + index);
    return [candidate.candidate_id, {
      blind_id: `candidate_${letter.toLowerCase()}`,
      label: `Candidate ${letter}`
    }];
  }));
}

function blindRef(aliases, candidateId) {
  const alias = aliases.get(candidateId);
  return {
    candidate_id: candidateId,
    blind_id: alias?.blind_id || candidateId,
    label: alias?.label || candidateId
  };
}

function buildBlindCandidateSummary(candidate) {
  const changedFileCount = candidate.metrics?.changed_file_count ?? candidate.changed_files?.length ?? 0;
  const changedLines = candidate.metrics?.patch_stats?.total_changed_lines ?? 0;
  const blocked = candidate.metrics?.blocked_path_touches?.length || 0;
  const outsideScope = candidate.metrics?.outside_allowed_paths?.length || 0;
  const parts = [
    candidate.eligible ? 'Passed deterministic gates.' : 'Did not pass deterministic gates.',
    candidate.verification_status === 'pass' ? 'Verification passed.' : `Verification ${candidate.verification_status}.`,
    `Touched ${changedFileCount} file${changedFileCount === 1 ? '' : 's'} and changed ${changedLines} lines.`
  ];

  if (blocked > 0) {
    parts.push(`Touched ${blocked} blocked path${blocked === 1 ? '' : 's'}.`);
  } else if (outsideScope > 0) {
    parts.push(`Edited ${outsideScope} path${outsideScope === 1 ? '' : 's'} outside the preferred scope.`);
  } else {
    parts.push('Stayed inside the preferred path scope.');
  }

  return parts.join(' ');
}

function sanitizeText(text, candidates = [], aliases = new Map()) {
  if (!text) {
    return text;
  }

  let next = String(text);
  const replacements = [];
  for (const candidate of candidates || []) {
    const alias = aliases.get(candidate.candidate_id);
    if (!alias) {
      continue;
    }
    replacements.push([candidate.candidate_id, alias.label]);
    replacements.push([`${candidate.candidate_slot} / ${candidate.provider}`, alias.label]);
    replacements.push([`${candidate.candidate_slot} / ${candidate.provider_instance_id || candidate.provider}`, alias.label]);
  }

  replacements
    .sort((left, right) => right[0].length - left[0].length)
    .forEach(([source, target]) => {
      next = next.split(source).join(target);
    });

  return next;
}

function deriveComposerMode(mergePlan) {
  if (!mergePlan || mergePlan.mode === 'no_winner') {
    return 'blocked';
  }
  if (mergePlan.mode === 'winner_only') {
    return 'winner_finalize';
  }
  return 'file_compose';
}

function buildComposerSummary({ mode, baseCandidate, unresolvedConflicts, judgeRationale }) {
  if (mode === 'blocked') {
    return 'No safe composer action is available until at least one candidate passes deterministic gates.';
  }
  if (mode === 'winner_finalize') {
    return `${baseCandidate?.label || 'The leading candidate'} can be finalized whole after a quick human diff review.`;
  }
  if (unresolvedConflicts.length > 0) {
    return `${unresolvedConflicts.length} contested file${unresolvedConflicts.length === 1 ? '' : 's'} still need explicit human review before composing the final synthesis.`;
  }
  return judgeRationale?.next_action || `${baseCandidate?.label || 'The leading candidate'} should be used as the base for file-level composition.`;
}

function buildComposerSteps({ mode, unresolvedConflicts, judgeRationale }) {
  if (mode === 'blocked') {
    return ['Repair verification or auth failures before attempting composition.'];
  }

  const steps = [];
  if (mode === 'winner_finalize') {
    steps.push('Inspect the leading candidate diff in blind mode first.');
    steps.push('If the implementation still looks correct, finalize the whole candidate.');
  } else {
    steps.push('Review the blind file allocations before revealing provider identity.');
    if (unresolvedConflicts.length > 0) {
      steps.push('Resolve contested files explicitly before building the synthesis workspace.');
    } else {
      steps.push('Build the synthesis workspace from the composer plan and rerun full verification.');
    }
  }

  for (const line of judgeRationale?.operator_guidance || []) {
    if (!steps.includes(line)) {
      steps.push(line);
    }
  }

  return steps;
}
