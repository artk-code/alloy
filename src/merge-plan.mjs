const TEST_FILE_PATTERN = /(^|\/)(test|tests|spec|specs|__tests__)(\/|$)|\.(test|spec)\.[^.]+$/i;
const DOC_FILE_PATTERN = /(^|\/)(docs?|notes?|adr)(\/|$)|\.(md|mdx|txt)$/i;
const ALLOWED_MODES = new Set(['winner_only', 'file_select', 'manual_review', 'no_winner']);
const ALLOWED_CONFIDENCE = new Set(['high', 'medium', 'low']);
const ALLOWED_RISK = new Set(['low', 'medium', 'high']);

export function buildMergePlan({ candidates, decision }) {
  const candidatesById = new Map((candidates || []).map((candidate) => [candidate.candidate_id, candidate]));
  const finalists = (decision?.finalist_candidate_ids || [])
    .map((candidateId) => candidatesById.get(candidateId))
    .filter(Boolean);
  const baseCandidate = resolveBaseCandidate({ candidates, finalists, decision, candidatesById });

  if (!baseCandidate) {
    return {
      base_candidate_id: null,
      mode: 'no_winner',
      confidence: 'low',
      rationale: decision?.rationale || 'No candidate passed deterministic gates.',
      verification_expectation: 'full_repo_checks_required',
      file_decisions: [],
      unresolved_conflicts: []
    };
  }

  const mergeScope = buildMergeScope({ candidates, finalists, decision, baseCandidate });
  const fileDecisions = [];
  const unresolvedConflicts = [];

  for (const [filePath, contenders] of mergeScope.entries()) {
    const rankedContenders = [...contenders].sort(compareMergeCandidates);
    const chosen = rankedContenders[0];
    const runnerUp = rankedContenders[1] || null;
    const gap = runnerUp ? chosen.scorecard.total - runnerUp.scorecard.total : chosen.scorecard.total;
    const fileType = classifyFilePath(filePath);
    const contested = rankedContenders.length > 1;
    const confidence = contested
      ? (gap >= 8 ? 'high' : gap >= 3 ? 'medium' : 'low')
      : 'high';
    const riskLevel = deriveRiskLevel({ fileType, contested, confidence });
    const decisionReason = deriveDecisionReason({
      filePath,
      fileType,
      contenders: rankedContenders,
      chosen,
      baseCandidateId: baseCandidate.candidate_id,
      contested
    });

    fileDecisions.push({
      path: filePath,
      chosen_candidate_id: chosen.candidate_id,
      contender_candidate_ids: rankedContenders.map((candidate) => candidate.candidate_id),
      decision_reason: decisionReason,
      risk_level: riskLevel,
      confidence
    });

    if (contested && confidence === 'low') {
      unresolvedConflicts.push({
        path: filePath,
        contender_candidate_ids: rankedContenders.map((candidate) => candidate.candidate_id),
        recommended_candidate_id: chosen.candidate_id,
        reason: 'Contested file with no clear deterministic leader.'
      });
    }
  }

  return {
    base_candidate_id: baseCandidate.candidate_id,
    mode: deriveMergeMode({ decision, unresolvedConflicts }),
    confidence: unresolvedConflicts.length > 0 ? 'low' : (decision?.confidence || 'medium'),
    rationale: buildPlanRationale({ decision, baseCandidate, unresolvedConflicts }),
    verification_expectation: 'full_repo_checks_required',
    file_decisions: fileDecisions,
    unresolved_conflicts: unresolvedConflicts
  };
}

export function buildMergePlanFromSelections({
  candidates,
  evaluation = null,
  strategy = 'winner_only',
  winnerCandidateId = null,
  fileSelections = {}
}) {
  const candidatesById = new Map((candidates || []).map((candidate) => [candidate.candidate_id, candidate]));
  const baseCandidateId = winnerCandidateId
    || evaluation?.merge_plan?.base_candidate_id
    || evaluation?.decision?.winner_candidate_id
    || candidates?.[0]?.candidate_id
    || null;

  if (strategy === 'winner_only') {
    const winner = baseCandidateId ? candidatesById.get(baseCandidateId) : null;
    if (!winner) {
      throw new Error('Winner-only synthesis requires a valid winner candidate.');
    }

    return {
      base_candidate_id: winner.candidate_id,
      mode: 'winner_only',
      confidence: 'high',
      rationale: `Whole-candidate synthesis from ${winner.candidate_slot} / ${winner.provider}.`,
      verification_expectation: 'full_repo_checks_required',
      file_decisions: (winner.changed_files || []).sort().map((filePath) => ({
        path: filePath,
        chosen_candidate_id: winner.candidate_id,
        contender_candidate_ids: [winner.candidate_id],
        decision_reason: 'winner candidate',
        risk_level: deriveRiskLevel({ fileType: classifyFilePath(filePath), contested: false, confidence: 'high' }),
        confidence: 'high'
      })),
      unresolved_conflicts: []
    };
  }

  const selectedEntries = Object.entries(fileSelections || {})
    .filter(([, candidateId]) => candidateId)
    .sort(([left], [right]) => left.localeCompare(right));

  if (selectedEntries.length === 0) {
    throw new Error('File-select synthesis requires at least one file selection.');
  }

  return {
    base_candidate_id: baseCandidateId,
    mode: 'file_select',
    confidence: 'medium',
    rationale: 'Manual file-selection synthesis from the Control Panel.',
    verification_expectation: 'full_repo_checks_required',
    file_decisions: selectedEntries.map(([filePath, candidateId]) => {
      const candidate = candidatesById.get(candidateId);
      if (!candidate) {
        throw new Error(`Invalid file selection candidate: ${candidateId}`);
      }
      return {
        path: filePath,
        chosen_candidate_id: candidateId,
        contender_candidate_ids: collectContendersForPath(candidates, filePath),
        decision_reason: 'manual override',
        risk_level: deriveRiskLevel({ fileType: classifyFilePath(filePath), contested: true, confidence: 'medium' }),
        confidence: 'medium'
      };
    }),
    unresolved_conflicts: []
  };
}

export function validateMergePlan({ mergePlan, candidates }) {
  const errors = [];
  const candidatesById = new Map((candidates || []).map((candidate) => [candidate.candidate_id, candidate]));

  if (!mergePlan || typeof mergePlan !== 'object') {
    return { ok: false, errors: ['merge_plan must be an object'] };
  }

  if (!ALLOWED_MODES.has(mergePlan.mode)) {
    errors.push(`merge_plan.mode must be one of ${[...ALLOWED_MODES].join(', ')}`);
  }

  if (!ALLOWED_CONFIDENCE.has(mergePlan.confidence)) {
    errors.push('merge_plan.confidence must be high, medium, or low');
  }

  if (mergePlan.base_candidate_id && !candidatesById.has(mergePlan.base_candidate_id)) {
    errors.push(`merge_plan.base_candidate_id references unknown candidate ${mergePlan.base_candidate_id}`);
  }

  if (!Array.isArray(mergePlan.file_decisions)) {
    errors.push('merge_plan.file_decisions must be an array');
  } else {
    for (const decision of mergePlan.file_decisions) {
      if (!decision?.path) {
        errors.push('merge_plan.file_decisions[*].path is required');
        continue;
      }

      if (!candidatesById.has(decision.chosen_candidate_id)) {
        errors.push(`file_decision for ${decision.path} references unknown candidate ${decision.chosen_candidate_id}`);
        continue;
      }

      const chosen = candidatesById.get(decision.chosen_candidate_id);
      if (!(chosen.changed_files || []).includes(decision.path)) {
        errors.push(`chosen candidate ${decision.chosen_candidate_id} does not own ${decision.path}`);
      }

      if (!Array.isArray(decision.contender_candidate_ids) || decision.contender_candidate_ids.length === 0) {
        errors.push(`file_decision for ${decision.path} must include contender_candidate_ids`);
      } else if (!decision.contender_candidate_ids.includes(decision.chosen_candidate_id)) {
        errors.push(`file_decision for ${decision.path} must include chosen candidate in contender_candidate_ids`);
      }

      if (!ALLOWED_CONFIDENCE.has(decision.confidence)) {
        errors.push(`file_decision for ${decision.path} has invalid confidence`);
      }
      if (!ALLOWED_RISK.has(decision.risk_level)) {
        errors.push(`file_decision for ${decision.path} has invalid risk level`);
      }
    }
  }

  if (!Array.isArray(mergePlan.unresolved_conflicts)) {
    errors.push('merge_plan.unresolved_conflicts must be an array');
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function materializeSelectionsFromMergePlan(mergePlan) {
  return (mergePlan?.file_decisions || []).map((decision) => ({
    path: decision.path,
    candidate_id: decision.chosen_candidate_id
  }));
}

function resolveBaseCandidate({ candidates, finalists, decision, candidatesById }) {
  if (decision?.winner_candidate_id && candidatesById.has(decision.winner_candidate_id)) {
    return candidatesById.get(decision.winner_candidate_id);
  }
  if (finalists[0]) {
    return finalists[0];
  }
  const eligible = (candidates || []).filter((candidate) => candidate.eligible).sort(compareMergeCandidates);
  return eligible[0] || null;
}

function buildMergeScope({ candidates, finalists, decision, baseCandidate }) {
  const scopedCandidates = decision?.mode === 'winner'
    ? [baseCandidate]
    : (finalists.length > 0 ? finalists : (candidates || []).filter((candidate) => candidate.eligible));
  const scope = new Map();

  for (const candidate of scopedCandidates) {
    for (const filePath of candidate.changed_files || []) {
      if (!scope.has(filePath)) {
        scope.set(filePath, []);
      }
      scope.get(filePath).push(candidate);
    }
  }

  return new Map([...scope.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function compareMergeCandidates(left, right) {
  if (left.eligible !== right.eligible) {
    return left.eligible ? -1 : 1;
  }
  if (left.scorecard?.total !== right.scorecard?.total) {
    return (right.scorecard?.total || 0) - (left.scorecard?.total || 0);
  }
  if (left.metrics?.changed_file_count !== right.metrics?.changed_file_count) {
    return (left.metrics?.changed_file_count || 0) - (right.metrics?.changed_file_count || 0);
  }
  if (left.metrics?.patch_stats?.total_changed_lines !== right.metrics?.patch_stats?.total_changed_lines) {
    return (left.metrics?.patch_stats?.total_changed_lines || 0) - (right.metrics?.patch_stats?.total_changed_lines || 0);
  }
  return String(left.candidate_slot || '').localeCompare(String(right.candidate_slot || ''));
}

export function classifyFilePath(filePath) {
  if (TEST_FILE_PATTERN.test(filePath)) {
    return 'test';
  }
  if (DOC_FILE_PATTERN.test(filePath)) {
    return 'doc';
  }
  return 'code';
}

function deriveRiskLevel({ fileType, contested, confidence }) {
  if (!contested) {
    return fileType === 'code' ? 'medium' : 'low';
  }
  if (confidence === 'low') {
    return 'high';
  }
  if (fileType === 'test' || fileType === 'doc') {
    return 'medium';
  }
  return 'high';
}

function deriveDecisionReason({ filePath, fileType, contenders, chosen, baseCandidateId, contested }) {
  if (!contested) {
    return 'only candidate touching this file';
  }
  if (chosen.candidate_id === baseCandidateId && fileType === 'code') {
    return 'retain strongest core implementation from the base candidate';
  }
  if (chosen.candidate_id === baseCandidateId) {
    return 'base candidate remains the strongest deterministic owner of this file';
  }
  if (fileType === 'test') {
    return 'strongest deterministic regression coverage among finalists';
  }
  if (fileType === 'doc') {
    return 'strongest supporting explanation or documentation among finalists';
  }
  if (contenders.length > 1) {
    return 'best deterministic score among contested candidates';
  }
  return `selected ${filePath} from the strongest contender`;
}

function deriveMergeMode({ decision, unresolvedConflicts }) {
  if (decision?.mode === 'no_winner') {
    return 'no_winner';
  }
  if (unresolvedConflicts.length > 0) {
    return 'manual_review';
  }
  return decision?.mode === 'winner' ? 'winner_only' : 'file_select';
}

function buildPlanRationale({ decision, baseCandidate, unresolvedConflicts }) {
  const prefix = baseCandidate
    ? `Base candidate ${baseCandidate.candidate_slot} / ${baseCandidate.provider} anchors the merge plan.`
    : 'No base candidate is available.';
  const unresolved = unresolvedConflicts.length > 0
    ? ` ${unresolvedConflicts.length} contested file${unresolvedConflicts.length === 1 ? ' requires' : 's require'} manual review before a safe final merge.`
    : '';
  return `${prefix} ${decision?.rationale || 'Deterministic evaluation produced the current merge recommendation.'}${unresolved}`.trim();
}

function collectContendersForPath(candidates, filePath) {
  return (candidates || [])
    .filter((candidate) => (candidate.changed_files || []).includes(filePath))
    .map((candidate) => candidate.candidate_id);
}
