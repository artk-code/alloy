const state = {
  taskId: new URLSearchParams(window.location.search).get('task') || null,
  focusCandidateId: new URLSearchParams(window.location.search).get('candidate') || null,
  taskDetail: null,
  candidateDiff: null,
  synthesisDiff: null,
  diffMode: 'candidate',
  diffCandidateId: null,
  diffFilePath: null,
  mergeSelections: {}
};

const summaryRoot = document.querySelector('#compare-summary');
const candidatesRoot = document.querySelector('#compare-candidates');
const mergeRoot = document.querySelector('#compare-merge');
const diffRoot = document.querySelector('#compare-diff');
const titleRoot = document.querySelector('#compare-title');
const subtitleRoot = document.querySelector('#compare-subtitle');
const taskCrumbRoot = document.querySelector('#compare-task-crumb');
const compareDocsLink = document.querySelector('#compare-docs-link');
const toastStack = document.querySelector('#toast-stack');

document.querySelector('#refresh-compare').addEventListener('click', () => boot());

boot().catch((error) => {
  renderMissingTask();
  showToast({
    title: 'Compare page failed to load',
    lines: [error.message || String(error)],
    tone: 'danger',
    timeoutMs: 9000
  });
});

async function boot() {
  if (!state.taskId) {
    renderMissingTask();
    return;
  }

  await loadTaskDetail();
  await loadSynthesisDiff();
  await loadActiveDiff();
  renderPage();
}

async function loadTaskDetail() {
  const response = await fetch(`/api/tasks/${encodeURIComponent(state.taskId)}`);
  if (!response.ok) {
    throw new Error(`Task not found: ${state.taskId}`);
  }

  state.taskDetail = await response.json();
  state.diffCandidateId = pickDefaultDiffCandidateId(state.taskDetail, state.focusCandidateId || state.diffCandidateId);
  state.mergeSelections = buildInitialMergeSelections(state.taskDetail.merge_view, state.mergeSelections);
}

async function loadCandidateDiff(candidateId) {
  if (!candidateId) {
    state.candidateDiff = null;
    state.diffFilePath = null;
    return;
  }

  const response = await fetch(
    `/api/tasks/${encodeURIComponent(state.taskId)}/candidates/${encodeURIComponent(candidateId)}/diff`
  );
  if (!response.ok) {
    state.candidateDiff = null;
    return;
  }

  state.candidateDiff = await response.json();
  if (state.diffMode === 'candidate') {
    state.diffFilePath = state.candidateDiff.files?.[0]?.path || null;
  }
}

async function loadSynthesisDiff() {
  const response = await fetch(`/api/tasks/${encodeURIComponent(state.taskId)}/synthesis/diff`);
  if (!response.ok) {
    state.synthesisDiff = null;
    return;
  }
  state.synthesisDiff = await response.json();
}

async function loadActiveDiff() {
  if (state.diffMode === 'synthesis') {
    const files = state.synthesisDiff?.files || [];
    state.diffFilePath = files[0]?.path || null;
    return;
  }
  await loadCandidateDiff(state.diffCandidateId);
}

function renderPage() {
  const task = state.taskDetail?.task || null;
  titleRoot.textContent = 'Compare Diffs';
  taskCrumbRoot.textContent = task?.title || 'Task';
  subtitleRoot.textContent = [
    task?.title || null,
    task?.project_label ? `${task.project_label}` : null,
    task?.repo || null,
    state.taskDetail?.latest_run_overview?.status_label || null
  ].filter(Boolean).join(' • ');
  document.title = task?.title ? `Alloy Compare Diffs - ${task.title}` : 'Alloy Compare Diffs';
  const activeNavLink = document.querySelector('.page-nav .nav-link.is-active');
  if (activeNavLink) {
    activeNavLink.setAttribute('href', window.location.pathname + window.location.search);
  }
  if (compareDocsLink) {
    compareDocsLink.href = buildDocsUrl(state.taskId);
  }

  renderSummary();
  renderCandidates();
  renderMerge();
  renderDiff();
}

function renderMissingTask() {
  titleRoot.textContent = 'Compare Diffs';
  taskCrumbRoot.textContent = 'Missing task';
  subtitleRoot.textContent = 'Open this page from the Control Panel or include ?task=<task_id> in the URL.';
  appendInfoBlock(summaryRoot, 'Task', 'No task id was provided.');
}

function renderSummary() {
  summaryRoot.innerHTML = '';
  const detail = state.taskDetail;
  if (!detail) {
    appendInfoBlock(summaryRoot, 'Task', 'Task detail has not loaded yet.');
    return;
  }

  appendInfoBlock(summaryRoot, 'Breadcrumb', [
    detail.project_label || detail.project_id,
    detail.task.title,
    detail.latest_run_overview?.status_label || 'Draft'
  ].filter(Boolean).join(' • '));
  appendInfoBlock(summaryRoot, 'Decision', detail.comparison_view?.decision?.summary || 'No evaluator decision is available yet.');
  appendInfoBlock(summaryRoot, 'Execution', detail.latest_run_overview?.execution_summary || 'No run summary available.');
  appendInfoBlock(summaryRoot, 'Run Provenance', [
    detail.latest_run_overview?.run_origin_label || 'No run',
    detail.latest_run_overview?.run_origin_detail || null
  ].filter(Boolean).join(' • '));

  const mergePlan = detail.comparison_view?.merge_plan;
  const judgeRationale = detail.comparison_view?.judge_rationale || detail.judge_rationale || null;
  if (mergePlan) {
    appendInfoBlock(summaryRoot, 'Merge Plan', [
      mergePlan.base_candidate_label ? `base ${mergePlan.base_candidate_label}` : null,
      mergePlan.mode,
      `confidence ${mergePlan.confidence}`,
      `${mergePlan.file_decisions.length} file decision${mergePlan.file_decisions.length === 1 ? '' : 's'}`,
      mergePlan.unresolved_conflicts.length ? `${mergePlan.unresolved_conflicts.length} unresolved` : 'no unresolved conflicts'
    ].filter(Boolean).join(' • '));
    appendInfoBlock(summaryRoot, 'Plan Rationale', mergePlan.rationale);
  }

  if (judgeRationale) {
    appendInfoBlock(summaryRoot, 'Judge Overview', judgeRationale.overview);
    appendInfoBlock(summaryRoot, 'Next Action', judgeRationale.next_action);
    appendListBlock(
      summaryRoot,
      'Top Strengths',
      (judgeRationale.strengths || []).map((strength) => (
        `${strength.label}: ${strength.candidate_label} • ${strength.reason}`
      )),
      'No deterministic strengths are available yet.'
    );
    appendListBlock(
      summaryRoot,
      'Risk Flags',
      (judgeRationale.risk_flags || []).map((flag) => (
        [flag.severity.toUpperCase(), flag.path || null, flag.message].filter(Boolean).join(' • ')
      )),
      'No major deterministic risks flagged.'
    );
  }
}

function renderCandidates() {
  candidatesRoot.innerHTML = '';
  const rows = state.taskDetail?.comparison_view?.rows || [];
  if (rows.length === 0) {
    appendInfoBlock(candidatesRoot, 'Candidates', 'No candidate artifacts are available yet.');
    return;
  }

  for (const row of rows) {
    const article = document.createElement('article');
    article.className = 'comparison-row';

    const header = document.createElement('div');
    header.className = 'candidate-header';
    const label = document.createElement('strong');
    label.textContent = row.label;
    const status = document.createElement('span');
    status.textContent = row.score != null ? `${row.score}/100` : formatStatusBadge(row.status);
    status.className = `candidate-status ${stateClass(row.eligible ? 'valid' : row.verification_status)}`;
    header.append(label, status);

    const meta = document.createElement('p');
    meta.className = 'comparison-meta';
    meta.textContent = [
      row.eligible ? 'eligible' : row.verification_status,
      `${row.changed_file_count} files`,
      `${row.total_changed_lines} lines`,
      row.jj_change_id ? `jj ${shortId(row.jj_change_id)}` : 'jj pending'
    ].join(' • ');

    const summary = document.createElement('p');
    summary.className = 'comparison-summary';
    summary.textContent = row.summary;

    const actions = document.createElement('div');
    actions.className = 'task-chip-row';
    const diffButton = document.createElement('button');
    diffButton.className = state.diffMode === 'candidate' && state.diffCandidateId === row.candidate_id ? '' : 'ghost-button';
    diffButton.textContent = 'Inspect Candidate Diff';
    diffButton.addEventListener('click', async () => {
      state.diffMode = 'candidate';
      state.diffCandidateId = row.candidate_id;
      await loadActiveDiff();
      renderDiff();
      renderCandidates();
    });
    actions.appendChild(diffButton);

    article.append(header, meta, summary, actions);
    candidatesRoot.appendChild(article);
  }
}

function renderMerge() {
  mergeRoot.innerHTML = '';
  const merge = state.taskDetail?.merge_view;

  if (!merge) {
    appendInfoBlock(mergeRoot, 'Merge', 'No merge plan is available yet.');
    return;
  }

  appendInfoBlock(
    mergeRoot,
    'Policy',
    `Current mode: ${state.taskDetail.run_config?.merge_mode || merge.merge_mode}. Human review stays at the merge boundary unless a clear deterministic winner is auto-finalized.`
  );

  if (merge.merge_plan) {
    appendInfoBlock(
      mergeRoot,
      'Plan Summary',
      [
        merge.merge_plan.base_candidate_label ? `base ${merge.merge_plan.base_candidate_label}` : null,
        merge.merge_plan.mode,
        `confidence ${merge.merge_plan.confidence}`,
        merge.merge_plan.unresolved_conflicts?.length
          ? `${merge.merge_plan.unresolved_conflicts.length} unresolved conflict${merge.merge_plan.unresolved_conflicts.length === 1 ? '' : 's'}`
          : 'no unresolved conflicts'
      ].filter(Boolean).join(' • ')
    );
  }

  if (merge.judge_rationale) {
    appendInfoBlock(
      mergeRoot,
      'Judge Call',
      merge.judge_rationale.overview
    );
    appendListBlock(
      mergeRoot,
      'Operator Guidance',
      merge.judge_rationale.operator_guidance || [],
      'No operator guidance is available yet.'
    );
  }

  if (merge.synthesis) {
    appendInfoBlock(
      mergeRoot,
      'Latest Synthesis',
      [
        `${merge.synthesis.strategy} • ${merge.synthesis.status}`,
        merge.synthesis.jj_change_id ? `jj ${shortId(merge.synthesis.jj_change_id)}` : null,
        merge.synthesis.verification?.status ? `verification ${merge.synthesis.verification.status}` : null,
        merge.synthesis.workspace_path || null
      ].filter(Boolean).join(' • ')
    );
  }

  if (merge.winner_candidate_id && merge.merge_plan?.mode === 'winner_only') {
    const winnerBlock = document.createElement('div');
    winnerBlock.className = 'info-block';
    const title = document.createElement('h4');
    title.textContent = 'Whole-Candidate Finalization';
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Finalize the recommended winner using the evaluator-produced merge plan.';
    const button = document.createElement('button');
    button.textContent = 'Finalize Recommended Winner';
    button.addEventListener('click', async () => {
      await createSynthesis({ merge_plan: state.taskDetail.comparison_view?.merge_plan || merge.merge_plan });
    });
    winnerBlock.append(title, paragraph, button);
    mergeRoot.appendChild(winnerBlock);
  }

  if (!merge.files?.length) {
    appendInfoBlock(mergeRoot, 'Manual Merge', 'No changed files are available for manual synthesis.');
    return;
  }

  if (merge.judge_rationale?.unresolved_conflicts?.length) {
    appendListBlock(
      mergeRoot,
      'Unresolved Conflicts',
      merge.judge_rationale.unresolved_conflicts.map((conflict) => (
        `${conflict.path} • ${conflict.reason} • ${conflict.contender_labels.join(', ')}`
      )),
      'No unresolved conflicts.'
    );
  }

  const manualBlock = document.createElement('div');
  manualBlock.className = 'info-block';
  const manualTitle = document.createElement('h4');
  manualTitle.textContent = 'Per-File Provenance';
  const manualBody = document.createElement('p');
  manualBody.textContent = 'Review planned file ownership, inspect contested files first, and override selections only where the merge plan needs a human decision.';
  manualBlock.append(manualTitle, manualBody);

  for (const file of merge.files) {
    const row = document.createElement('article');
    row.className = 'provenance-row';

    const rowHeader = document.createElement('div');
    rowHeader.className = 'candidate-header';
    const rowTitle = document.createElement('strong');
    rowTitle.textContent = file.path;
    const rowBadge = document.createElement('span');
    rowBadge.className = `candidate-status ${file.unresolved_conflict ? 'state-fail' : (file.contested ? 'state-warn' : 'state-idle')}`;
    rowBadge.textContent = file.unresolved_conflict ? '✕ manual review' : (file.contested ? '? contested' : '• single source');
    rowHeader.append(rowTitle, rowBadge);
    row.appendChild(rowHeader);

    const selectedCandidateId = state.mergeSelections[file.path] || '';
    const selectedOwner = file.owners.find((owner) => owner.candidate_id === selectedCandidateId) || null;

    const selectLabel = document.createElement('label');
    selectLabel.className = 'field-label';
    selectLabel.textContent = 'Selected source';
    const select = document.createElement('select');
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = 'skip';
    select.appendChild(emptyOption);
    for (const owner of file.owners) {
      const option = document.createElement('option');
      option.value = owner.candidate_id;
      option.textContent = owner.label;
      select.appendChild(option);
    }
    select.value = selectedCandidateId;
    select.addEventListener('change', () => {
      state.mergeSelections[file.path] = select.value || null;
      renderMerge();
    });
    selectLabel.appendChild(select);
    row.appendChild(selectLabel);

    const selectedSummary = document.createElement('p');
    selectedSummary.className = 'comparison-summary';
    selectedSummary.textContent = selectedOwner
      ? [
          `Current source ${selectedOwner.label}`,
          selectedOwner.verification_status ? `verification ${selectedOwner.verification_status}` : null,
          selectedOwner.jj_change_id ? `jj ${shortId(selectedOwner.jj_change_id)}` : null,
          file.selection_reasons?.[selectedOwner.candidate_id] || null,
          file.planned_confidence ? `confidence ${file.planned_confidence}` : null,
          file.planned_risk_level ? `risk ${file.planned_risk_level}` : null
        ].filter(Boolean).join(' • ')
      : 'No source selected for this file yet. Keep it skipped or choose a candidate before building the synthesis workspace.';
    row.appendChild(selectedSummary);

    const ownerList = document.createElement('div');
    ownerList.className = 'provenance-list';
    for (const owner of file.owners) {
      const ownerRow = document.createElement('div');
      ownerRow.className = 'provenance-owner';
      const ownerLabel = document.createElement('strong');
      ownerLabel.textContent = owner.label;
      const ownerMeta = document.createElement('p');
      ownerMeta.textContent = [
        owner.provider_label,
        owner.score != null ? `${owner.score}/100` : 'score pending',
        owner.verification_status ? `verification ${owner.verification_status}` : null,
        owner.jj_change_id ? `jj ${shortId(owner.jj_change_id)}` : null,
        file.selection_reasons?.[owner.candidate_id] || null,
        file.planned_candidate_id === owner.candidate_id ? 'recommended by merge plan' : null,
        file.synthesized_candidate_id === owner.candidate_id ? 'selected in latest synthesis' : null
      ].filter(Boolean).join(' • ');
      ownerRow.append(ownerLabel, ownerMeta);
      ownerList.appendChild(ownerRow);
    }
    row.appendChild(ownerList);
    manualBlock.appendChild(row);
  }

  const actions = document.createElement('div');
  actions.className = 'task-chip-row';
  const resetButton = document.createElement('button');
  resetButton.className = 'ghost-button';
  resetButton.textContent = 'Reset To Merge Plan';
  resetButton.addEventListener('click', () => {
    state.mergeSelections = buildInitialMergeSelections(merge, {});
    renderMerge();
  });

  const buildButton = document.createElement('button');
  buildButton.textContent = 'Build Selected Merge';
  buildButton.addEventListener('click', async () => {
    await createSynthesis({ merge_plan: buildManualMergePlan(merge, state.mergeSelections) });
  });
  actions.append(resetButton, buildButton);
  manualBlock.appendChild(actions);

  if (merge.merge_plan?.unresolved_conflicts?.length) {
    appendListBlock(
      manualBlock,
      'Unresolved Conflicts',
      merge.merge_plan.unresolved_conflicts.map((conflict) => [
        conflict.path,
        conflict.reason,
        conflict.recommended_candidate_id ? `recommended ${candidateLabelForId(merge, conflict.recommended_candidate_id)}` : null
      ].filter(Boolean).join(' • ')),
      'No unresolved conflicts.'
    );
  }

  mergeRoot.appendChild(manualBlock);
}

function renderDiff() {
  diffRoot.innerHTML = '';

  const controls = document.createElement('div');
  controls.className = 'info-block';
  const title = document.createElement('h4');
  title.textContent = 'Diff Mode';
  const modeRow = document.createElement('div');
  modeRow.className = 'task-chip-row';

  const candidateButton = document.createElement('button');
  candidateButton.className = state.diffMode === 'candidate' ? '' : 'ghost-button';
  candidateButton.textContent = 'Candidate Diff';
  candidateButton.addEventListener('click', async () => {
    state.diffMode = 'candidate';
    await loadActiveDiff();
    renderDiff();
    renderCandidates();
  });
  modeRow.appendChild(candidateButton);

  const synthesisButton = document.createElement('button');
  synthesisButton.className = state.diffMode === 'synthesis' ? '' : 'ghost-button';
  synthesisButton.textContent = 'Synthesis Diff';
  synthesisButton.disabled = !state.synthesisDiff;
  synthesisButton.addEventListener('click', async () => {
    state.diffMode = 'synthesis';
    await loadActiveDiff();
    renderDiff();
    renderCandidates();
  });
  modeRow.appendChild(synthesisButton);
  controls.append(title, modeRow);

  if (state.diffMode === 'candidate') {
    const selector = document.createElement('select');
    for (const row of state.taskDetail?.comparison_view?.rows || []) {
      const option = document.createElement('option');
      option.value = row.candidate_id;
      option.textContent = `${row.label} • ${row.changed_file_count} files`;
      selector.appendChild(option);
    }
    selector.value = state.diffCandidateId || '';
    selector.addEventListener('change', async () => {
      state.diffCandidateId = selector.value;
      await loadActiveDiff();
      renderDiff();
      renderCandidates();
    });
    controls.appendChild(selector);
  }
  diffRoot.appendChild(controls);

  const payload = state.diffMode === 'synthesis' ? state.synthesisDiff : state.candidateDiff;
  if (!payload) {
    appendInfoBlock(diffRoot, 'Patch', 'No captured patch is available for the current diff mode yet.');
    return;
  }

  appendInfoBlock(
    diffRoot,
    'Patch Summary',
    [
      payload.label || 'Patch',
      payload.diff_summary || 'No diff summary captured.',
      payload.jj?.candidate_revision?.change_id ? `jj ${shortId(payload.jj.candidate_revision.change_id)}` : null,
      payload.verification?.status ? `verification ${payload.verification.status}` : null
    ].filter(Boolean).join(' • ')
  );

  const fileBlock = document.createElement('div');
  fileBlock.className = 'info-block';
  const fileTitle = document.createElement('h4');
  fileTitle.textContent = 'Files';
  fileBlock.appendChild(fileTitle);
  const fileButtons = document.createElement('div');
  fileButtons.className = 'task-chip-row';
  for (const file of payload.files || []) {
    const button = document.createElement('button');
    button.className = state.diffFilePath === file.path ? '' : 'ghost-button';
    button.textContent = file.path;
    button.addEventListener('click', () => {
      state.diffFilePath = file.path;
      renderDiff();
    });
    fileButtons.appendChild(button);
  }
  fileBlock.appendChild(fileButtons);
  diffRoot.appendChild(fileBlock);

  const selectedFile = (payload.files || []).find((file) => file.path === state.diffFilePath)
    || payload.files?.[0]
    || null;

  if (state.diffMode === 'synthesis' && payload.contributions && selectedFile) {
    const contribution = payload.contributions[selectedFile.path];
    appendInfoBlock(
      diffRoot,
      'File Provenance',
      contribution
        ? [
            candidateLabelForId(state.taskDetail.merge_view, contribution.candidate_id),
            contribution.provider,
            contribution.decision_reason || null,
            contribution.confidence ? `confidence ${contribution.confidence}` : null,
            contribution.risk_level ? `risk ${contribution.risk_level}` : null
          ].filter(Boolean).join(' • ')
        : 'No recorded contribution metadata for this file.'
    );
  }

  const patchBlock = document.createElement('div');
  patchBlock.className = 'info-block';
  const patchTitle = document.createElement('h4');
  patchTitle.textContent = selectedFile ? `Patch • ${selectedFile.path}` : 'Patch';
  const patchPre = document.createElement('pre');
  patchPre.textContent = selectedFile?.patch || payload.patch || 'No patch text captured.';
  patchBlock.append(patchTitle, patchPre);
  diffRoot.appendChild(patchBlock);
}

async function createSynthesis(payload) {
  try {
    const response = await fetch(`/api/tasks/${encodeURIComponent(state.taskId)}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        selected_by: 'human-ui'
      })
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'synthesis_failed');
    }

    showToast({
      title: 'Synthesis created',
      lines: [
        `${result.synthesis.strategy} • ${result.synthesis.status}`,
        result.synthesis.workspace_path,
        result.synthesis.verification?.status ? `verification ${result.synthesis.verification.status}` : null
      ].filter(Boolean)
    });

    await boot();
  } catch (error) {
    showToast({
      title: 'Synthesis failed',
      lines: [error.message || String(error)],
      tone: 'danger'
    });
  }
}

function buildManualMergePlan(merge, selections) {
  const fileDecisions = (merge.files || [])
    .map((file) => {
      const chosenCandidateId = selections[file.path] || null;
      if (!chosenCandidateId) {
        return null;
      }
      return {
        path: file.path,
        chosen_candidate_id: chosenCandidateId,
        contender_candidate_ids: file.owners.map((owner) => owner.candidate_id),
        decision_reason: chosenCandidateId === file.planned_candidate_id
          ? (file.planned_decision_reason || 'merge plan selection')
          : 'manual override',
        risk_level: file.planned_risk_level || (file.contested ? 'high' : 'medium'),
        confidence: chosenCandidateId === file.planned_candidate_id
          ? (file.planned_confidence || 'medium')
          : 'medium'
      };
    })
    .filter(Boolean);

  if (fileDecisions.length === 0) {
    throw new Error('Select at least one file before building a synthesis workspace.');
  }

  return {
    base_candidate_id: merge.merge_plan?.base_candidate_id || merge.winner_candidate_id || fileDecisions[0].chosen_candidate_id,
    mode: fileDecisions.length === 1 && merge.merge_plan?.mode === 'winner_only' ? 'winner_only' : 'file_select',
    confidence: merge.merge_plan?.confidence || 'medium',
    rationale: 'Human-reviewed merge plan from the dedicated compare workspace.',
    verification_expectation: 'full_repo_checks_required',
    file_decisions: fileDecisions,
    unresolved_conflicts: []
  };
}

function buildInitialMergeSelections(mergeViewData, existingSelections = {}) {
  const next = {};
  for (const file of mergeViewData?.files || []) {
    next[file.path] = existingSelections[file.path]
      || file.synthesized_candidate_id
      || file.planned_candidate_id
      || (file.owners.length === 1 ? file.owners[0].candidate_id : null);
  }
  return next;
}

function pickDefaultDiffCandidateId(detail, currentCandidateId) {
  const rows = detail?.comparison_view?.rows || [];
  if (rows.length === 0) {
    return null;
  }
  const current = currentCandidateId && rows.find((row) => row.candidate_id === currentCandidateId);
  if (current) {
    return currentCandidateId;
  }
  return detail?.comparison_view?.decision?.winner?.candidate_id || rows[0].candidate_id;
}

function candidateLabelForId(merge, candidateId) {
  const owner = (merge?.files || []).flatMap((file) => file.owners).find((entry) => entry.candidate_id === candidateId);
  return owner?.label || candidateId;
}

function buildDocsUrl(taskId) {
  const params = new URLSearchParams({ doc: 'operator-guide' });
  if (taskId) {
    params.set('task', taskId);
  }
  return `/docs.html?${params.toString()}`;
}

function appendInfoBlock(root, heading, body) {
  const block = document.createElement('div');
  block.className = 'info-block';
  const title = document.createElement('h4');
  title.textContent = heading;
  const paragraph = document.createElement('p');
  paragraph.textContent = body;
  block.append(title, paragraph);
  root.appendChild(block);
}

function appendListBlock(root, heading, items, emptyText) {
  const block = document.createElement('div');
  block.className = 'info-block';
  const title = document.createElement('h4');
  title.textContent = heading;
  block.appendChild(title);

  if (!items.length) {
    const paragraph = document.createElement('p');
    paragraph.textContent = emptyText;
    block.appendChild(paragraph);
  } else {
    const list = document.createElement('ul');
    list.className = 'info-list';
    for (const item of items) {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    }
    block.appendChild(list);
  }

  root.appendChild(block);
}

function showToast({ title, lines = [], tone = 'info', timeoutMs = 6000 }) {
  const toast = document.createElement('article');
  toast.className = `toast toast-${tone}`;
  const heading = document.createElement('strong');
  heading.textContent = title;
  toast.appendChild(heading);
  for (const line of lines) {
    const paragraph = document.createElement('p');
    paragraph.textContent = line;
    toast.appendChild(paragraph);
  }
  toastStack.appendChild(toast);
  window.setTimeout(() => toast.remove(), timeoutMs);
}

function shortId(value) {
  return String(value || '').slice(0, 12);
}

function formatStatusBadge(status) {
  const lowered = String(status || '').toLowerCase();
  if (lowered.includes('pass') || lowered === 'valid' || lowered === 'completed') {
    return `✓ ${displayState(status)}`;
  }
  if (lowered.includes('fail') || lowered.includes('invalid') || lowered.includes('error')) {
    return `✕ ${displayState(status)}`;
  }
  if (lowered.includes('manual') || lowered.includes('unknown')) {
    return `? ${displayState(status)}`;
  }
  return `• ${displayState(status)}`;
}

function displayState(value) {
  return String(value || 'unknown').replace(/[_-]+/g, ' ');
}

function stateClass(value) {
  const lowered = String(value || '').toLowerCase();
  if (lowered.includes('pass') || lowered === 'valid' || lowered === 'completed') {
    return 'state-valid';
  }
  if (lowered.includes('fail') || lowered.includes('invalid') || lowered.includes('error')) {
    return 'state-fail';
  }
  if (lowered.includes('warn') || lowered.includes('manual') || lowered.includes('unknown')) {
    return 'state-warn';
  }
  return 'state-idle';
}
