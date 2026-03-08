import fs from 'node:fs/promises';

export async function evaluateRun({ task, manifests, outputPath = null }) {
  const candidates = manifests.map((manifest) => evaluateCandidate({ task, manifest }));
  const eligible = candidates.filter((candidate) => candidate.eligible);
  const ranking = [...candidates].sort(compareCandidates).map((candidate) => candidate.candidate_id);
  const pairwise_preferences = buildPairwisePreferences(candidates);
  const contribution_map = buildContributionMap(candidates, eligible);
  const decision = summarizeDecision(buildDecision(candidates, eligible), candidates);

  const result = {
    task_id: task.task_id,
    evaluated_at: new Date().toISOString(),
    candidate_count: candidates.length,
    candidates,
    ranking,
    pairwise_preferences,
    contribution_map,
    decision
  };

  if (outputPath) {
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  }

  return result;
}

function evaluateCandidate({ task, manifest }) {
  const changedFiles = manifest.changed_files || [];
  const patchStats = manifest.jj?.patch_stats || emptyPatchStats(changedFiles.length);
  const verificationPassed = manifest.verification?.status === 'pass';
  const completedCleanly = manifest.status === 'completed' && manifest.exit_code === 0 && !manifest.error;
  const blockedPathTouches = findPathMatches(changedFiles, task.blocked_paths || []);
  const outsideAllowedPaths = findOutsideAllowedPaths(changedFiles, task.allowed_paths || []);
  const hasChanges = changedFiles.length > 0;

  const scorecard = {
    correctness: verificationPassed ? 60 : 0,
    completion: completedCleanly ? 10 : 0,
    path_discipline: blockedPathTouches.length > 0 ? 0 : (outsideAllowedPaths.length > 0 ? 5 : 15),
    minimality: scoreMinimality({ patchStats, changedFiles }),
    summary_quality: manifest.summary ? 5 : 0
  };
  scorecard.total = Object.values(scorecard).reduce((sum, value) => sum + value, 0);

  const eligible = verificationPassed && blockedPathTouches.length === 0 && hasChanges;
  const reasons = buildReasons({
    verificationPassed,
    completedCleanly,
    blockedPathTouches,
    outsideAllowedPaths,
    patchStats,
    hasChanges
  });

  return {
    candidate_id: manifest.candidate_id,
    candidate_slot: manifest.candidate_slot,
    provider: manifest.provider,
    provider_instance_id: manifest.provider_instance_id,
    eligible,
    status: manifest.status,
    verification_status: manifest.verification?.status || 'not_run',
    changed_files: changedFiles,
    metrics: {
      changed_file_count: changedFiles.length,
      patch_stats: patchStats,
      blocked_path_touches: blockedPathTouches,
      outside_allowed_paths: outsideAllowedPaths
    },
    scorecard,
    reasons,
    summary: buildCandidateSummary({
      provider: manifest.provider,
      providerInstanceId: manifest.provider_instance_id,
      candidateSlot: manifest.candidate_slot,
      verificationPassed,
      completedCleanly,
      changedFiles,
      patchStats,
      blockedPathTouches,
      outsideAllowedPaths,
      hasChanges
    })
  };
}

function buildReasons({ verificationPassed, completedCleanly, blockedPathTouches, outsideAllowedPaths, patchStats, hasChanges }) {
  const reasons = [];

  reasons.push(verificationPassed ? 'verification_passed' : 'verification_failed');
  reasons.push(completedCleanly ? 'session_completed_cleanly' : 'session_completed_with_errors');

  if (!hasChanges) {
    reasons.push('no_code_changes_detected');
  }
  if (blockedPathTouches.length > 0) {
    reasons.push(`blocked_paths_touched:${blockedPathTouches.join(',')}`);
  }
  if (outsideAllowedPaths.length > 0) {
    reasons.push(`outside_allowed_paths:${outsideAllowedPaths.join(',')}`);
  }
  reasons.push(`changed_files:${patchStats.file_count}`);
  reasons.push(`changed_lines:${patchStats.total_changed_lines}`);

  return reasons;
}

function scoreMinimality({ patchStats, changedFiles }) {
  if (changedFiles.length === 0) {
    return 0;
  }

  let score = 10;
  score -= Math.min(6, Math.max(0, changedFiles.length - 1) * 2);
  score -= Math.min(4, Math.floor(Math.max(0, patchStats.total_changed_lines - 40) / 40));
  return Math.max(0, score);
}

function buildPairwisePreferences(candidates) {
  const pairs = [];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const left = candidates[i];
      const right = candidates[j];
      const preferred = compareCandidates(left, right) <= 0 ? left : right;
      pairs.push({
        left_candidate_id: left.candidate_id,
        right_candidate_id: right.candidate_id,
        preferred_candidate_id: preferred.candidate_id,
        reason: pairwiseReason(left, right, preferred)
      });
    }
  }
  return pairs;
}

function buildContributionMap(candidates, eligible) {
  const target = eligible.length > 0 ? eligible : candidates;
  return {
    top_score: pickCandidateId(target, (candidate) => candidate.scorecard.total, true),
    smallest_patch: pickCandidateId(target, (candidate) => candidate.metrics.patch_stats.total_changed_lines, false),
    narrowest_scope: pickCandidateId(target, (candidate) => candidate.metrics.changed_file_count, false),
    best_path_discipline: pickCandidateId(target, (candidate) => candidate.scorecard.path_discipline, true)
  };
}

function buildDecision(candidates, eligible) {
  if (eligible.length === 0) {
    return {
      mode: 'no_winner',
      confidence: 'low',
      rationale: 'No candidate passed deterministic verification and scope rules.',
      winner_candidate_id: null,
      finalist_candidate_ids: []
    };
  }

  const ordered = [...eligible].sort(compareCandidates);
  const winner = ordered[0];
  const runnerUp = ordered[1] || null;

  if (!runnerUp) {
    return {
      mode: 'winner',
      confidence: 'high',
      rationale: 'Only one candidate passed verification and scope rules.',
      winner_candidate_id: winner.candidate_id,
      finalist_candidate_ids: [winner.candidate_id]
    };
  }

  const gap = winner.scorecard.total - runnerUp.scorecard.total;
  if (gap >= 8) {
    return {
      mode: 'winner',
      confidence: 'high',
      rationale: `Top candidate led by ${gap} deterministic points.`,
      winner_candidate_id: winner.candidate_id,
      finalist_candidate_ids: [winner.candidate_id, runnerUp.candidate_id]
    };
  }

  if (gap >= 3) {
    return {
      mode: 'winner',
      confidence: 'medium',
      rationale: `Top candidate led by ${gap} deterministic points but close follow-up remains.`,
      winner_candidate_id: winner.candidate_id,
      finalist_candidate_ids: [winner.candidate_id, runnerUp.candidate_id]
    };
  }

  return {
    mode: 'synthesize',
    confidence: 'low',
    rationale: 'Top deterministic scores are close enough that a synthesis pass is justified.',
    winner_candidate_id: winner.candidate_id,
    finalist_candidate_ids: ordered
      .filter((candidate) => winner.scorecard.total - candidate.scorecard.total <= 3)
      .map((candidate) => candidate.candidate_id)
  };
}

function summarizeDecision(decision, candidates) {
  const candidatesById = new Map(candidates.map((candidate) => [candidate.candidate_id, candidate]));
  const winner = decision.winner_candidate_id ? candidatesById.get(decision.winner_candidate_id) : null;
  const finalists = (decision.finalist_candidate_ids || [])
    .map((candidateId) => candidatesById.get(candidateId))
    .filter(Boolean);

  let summary = 'No deterministic winner was found.';
  let card_summary = 'Waiting on a passing candidate.';

  if (decision.mode === 'winner' && winner) {
    summary = `Winner: ${formatCandidateLabel(winner)} with ${winner.scorecard.total}/100 after deterministic verification. ${decision.rationale}`;
    card_summary = `${formatCandidateLabel(winner)} is currently leading. ${decision.rationale}`;
  } else if (decision.mode === 'synthesize' && finalists.length > 0) {
    const finalistLabels = finalists.map(formatCandidateLabel).join(', ');
    summary = `Synthesis recommended across ${finalistLabels}. ${decision.rationale}`;
    card_summary = `Close finish between ${finalistLabels}; synthesis is justified.`;
  } else if (decision.mode === 'no_winner') {
    summary = `No winner: ${decision.rationale}`;
    card_summary = 'No candidate passed deterministic gates yet.';
  }

  return {
    ...decision,
    summary,
    card_summary,
    finalists: finalists.map((candidate) => ({
      candidate_id: candidate.candidate_id,
      label: formatCandidateLabel(candidate),
      score: candidate.scorecard.total,
      eligible: candidate.eligible
    })),
    winner: winner ? {
      candidate_id: winner.candidate_id,
      label: formatCandidateLabel(winner),
      score: winner.scorecard.total
    } : null
  };
}

function compareCandidates(left, right) {
  if (left.eligible !== right.eligible) {
    return left.eligible ? -1 : 1;
  }
  if (left.scorecard.total !== right.scorecard.total) {
    return right.scorecard.total - left.scorecard.total;
  }
  if (left.metrics.patch_stats.total_changed_lines !== right.metrics.patch_stats.total_changed_lines) {
    return left.metrics.patch_stats.total_changed_lines - right.metrics.patch_stats.total_changed_lines;
  }
  if (left.metrics.changed_file_count !== right.metrics.changed_file_count) {
    return left.metrics.changed_file_count - right.metrics.changed_file_count;
  }
  return left.candidate_slot.localeCompare(right.candidate_slot);
}

function pairwiseReason(left, right, preferred) {
  if (left.eligible !== right.eligible) {
    return `${preferred.candidate_id} passed deterministic gates while the other candidate did not.`;
  }
  if (left.scorecard.total !== right.scorecard.total) {
    return `${preferred.candidate_id} scored higher deterministically.`;
  }
  return `${preferred.candidate_id} changed fewer files/lines on tie-break.`;
}

function pickCandidateId(candidates, selector, descending) {
  if (candidates.length === 0) {
    return null;
  }

  const ordered = [...candidates].sort((left, right) => {
    const leftValue = selector(left);
    const rightValue = selector(right);
    if (leftValue !== rightValue) {
      return descending ? rightValue - leftValue : leftValue - rightValue;
    }
    return left.candidate_slot.localeCompare(right.candidate_slot);
  });
  return ordered[0].candidate_id;
}

function findPathMatches(paths, prefixes) {
  if (!prefixes.length) {
    return [];
  }
  return paths.filter((path) => matchesAnyPrefix(path, prefixes));
}

function findOutsideAllowedPaths(paths, allowedPaths) {
  if (!allowedPaths.length) {
    return [];
  }
  return paths.filter((path) => !matchesAnyPrefix(path, allowedPaths));
}

function matchesAnyPrefix(value, prefixes) {
  return prefixes.some((prefix) => value === prefix || value.startsWith(`${prefix}/`));
}

function emptyPatchStats(fileCount) {
  return {
    file_count: fileCount,
    added_lines: 0,
    removed_lines: 0,
    total_changed_lines: 0
  };
}

function buildCandidateSummary({
  provider,
  providerInstanceId,
  candidateSlot,
  verificationPassed,
  completedCleanly,
  changedFiles,
  patchStats,
  blockedPathTouches,
  outsideAllowedPaths,
  hasChanges
}) {
  const label = `${candidateSlot} / ${providerInstanceId || provider}`;
  if (!hasChanges) {
    return `${label} produced no captured code changes.`;
  }

  const status = verificationPassed
    ? 'passed verification'
    : completedCleanly
      ? 'finished but did not satisfy verification'
      : 'did not complete cleanly';

  const scopeNotes = [];
  if (blockedPathTouches.length > 0) {
    scopeNotes.push(`touched blocked paths: ${blockedPathTouches.join(', ')}`);
  } else if (outsideAllowedPaths.length > 0) {
    scopeNotes.push(`edited outside the preferred scope: ${outsideAllowedPaths.join(', ')}`);
  } else {
    scopeNotes.push('stayed inside the preferred path scope');
  }

  return `${label} ${status}, touched ${changedFiles.length} file${changedFiles.length === 1 ? '' : 's'}, and changed ${patchStats.total_changed_lines} lines. ${scopeNotes.join('. ')}.`;
}

function formatCandidateLabel(candidate) {
  return `${candidate.candidate_slot} / ${candidate.provider}`;
}
