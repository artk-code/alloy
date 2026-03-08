import { renderMarkdownInto } from './markdown-viewer.mjs';
import { initThemeToggle } from './theme.mjs';

const DETAIL_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'compare', label: 'Compare' },
  { id: 'candidates', label: 'Candidates' },
  { id: 'debug', label: 'Debug' }
];

const searchParams = new URLSearchParams(window.location.search);

const state = {
  taskId: searchParams.get('task') || null,
  taskDetail: null,
  parsedPreview: null,
  previewValidation: null,
  detailSection: 'overview',
  editorMode: 'source'
};

const titleRoot = document.querySelector('#operator-title');
const subtitleRoot = document.querySelector('#operator-subtitle');
const taskCrumbRoot = document.querySelector('#operator-task-crumb');
const detailTitle = document.querySelector('#detail-title');
const detailState = document.querySelector('#detail-state');
const detailNav = document.querySelector('#detail-nav');
const taskBrief = document.querySelector('#task-brief');
const evaluationCall = document.querySelector('#evaluation-call');
const comparisonView = document.querySelector('#comparison-view');
const candidateCards = document.querySelector('#candidate-cards');
const taskJson = document.querySelector('#task-json');
const runSummary = document.querySelector('#run-summary');
const taskMarkdown = document.querySelector('#task-markdown');
const taskMarkdownPreview = document.querySelector('#task-markdown-preview');
const taskMarkdownEditTab = document.querySelector('#task-markdown-edit-tab');
const taskMarkdownPreviewTab = document.querySelector('#task-markdown-preview-tab');
const compareLink = document.querySelector('#operator-compare-link');
const docsLink = document.querySelector('#operator-docs-link');
const homeLink = document.querySelector('#operator-home-link');
const openCompareButton = document.querySelector('#operator-open-compare');
const copyRunButton = document.querySelector('#operator-copy-run');
const createTaskButton = document.querySelector('#create-task-file');
const createTaskFilenameInput = document.querySelector('#create-task-filename');
const createTaskSourceInput = document.querySelector('#create-task-source');
const toastStack = document.querySelector('#toast-stack');
const candidateTemplate = document.querySelector('#candidate-template');

initThemeToggle();

document.querySelector('#refresh-operator').addEventListener('click', () => boot());
taskMarkdownEditTab.addEventListener('click', () => {
  state.editorMode = 'source';
  renderEditorMode();
});
taskMarkdownPreviewTab.addEventListener('click', () => {
  state.editorMode = 'preview';
  renderEditorMode();
});
taskMarkdown.addEventListener('input', () => {
  renderMarkdownPreview();
  const markdown = taskMarkdown.value;
  if (!markdown) {
    return;
  }
  window.clearTimeout(taskMarkdown._parseTimer);
  taskMarkdown._parseTimer = window.setTimeout(() => parseMarkdownPreview(markdown), 300);
});
openCompareButton.addEventListener('click', () => {
  if (state.taskId) {
    window.location.href = buildCompareUrl(state.taskId);
  }
});
copyRunButton.addEventListener('click', () => {
  if (state.taskDetail?.run_dir) {
    navigator.clipboard?.writeText(state.taskDetail.run_dir);
    showToast({
      title: 'Run path copied',
      lines: [state.taskDetail.run_dir]
    });
  }
});
createTaskButton.addEventListener('click', () => createTaskFile());

boot().catch((error) => {
  renderMissingTask(error);
  showToast({
    title: 'Operator view failed to load',
    lines: [error.message || String(error)],
    tone: 'danger',
    timeoutMs: 9000
  });
});

async function boot() {
  if (state.taskId) {
    await loadTaskDetail();
  } else {
    state.taskDetail = null;
    state.parsedPreview = null;
    state.previewValidation = null;
    taskMarkdown.value = '';
    renderMarkdownPreview();
  }
  renderPage();
}

async function loadTaskDetail() {
  const response = await fetch(`/api/tasks/${encodeURIComponent(state.taskId)}`);
  if (!response.ok) {
    throw new Error(`Task not found: ${state.taskId}`);
  }

  state.taskDetail = await response.json();
  state.parsedPreview = state.taskDetail.task;
  state.previewValidation = {
    ok: true,
    errors: [],
    warnings: state.taskDetail.warnings || []
  };
  taskMarkdown.value = state.taskDetail.markdown || '';
  renderMarkdownPreview();
}

async function parseMarkdownPreview(markdown) {
  const response = await fetch('/api/parse-markdown', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown, sourcePath: relativeTaskPath() })
  });
  const payload = await response.json();
  state.parsedPreview = payload.source_task || null;
  state.previewValidation = payload.validation || null;
  renderDetail();
}

async function createTaskFile() {
  try {
    const response = await fetch('/api/tasks/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        output_name: createTaskFilenameInput.value.trim(),
        source_path: createTaskSourceInput.value.trim() || null,
        markdown: taskMarkdown.value.trim()
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      const validationLines = [
        ...(payload.validation?.errors || []).map((entry) => entry.message),
        ...(payload.validation?.warnings || []).map((entry) => `warning: ${entry.message}`)
      ];
      throw new Error([payload.error || 'task_create_failed', ...validationLines].join(' | '));
    }

    showToast({
      title: 'Task file created',
      lines: [
        payload.task_id,
        payload.markdown_path,
        ...(payload.security_warnings || [])
      ]
    });

    const nextUrl = buildOperatorUrl(payload.task_id);
    window.location.href = nextUrl;
  } catch (error) {
    showToast({
      title: 'Task file creation failed',
      lines: [error.message || String(error)],
      tone: 'danger'
    });
  }
}

function renderPage() {
  const task = state.parsedPreview || state.taskDetail?.task || null;
  titleRoot.textContent = 'Operator View';
  taskCrumbRoot.textContent = task?.title || 'New task';
  subtitleRoot.textContent = task
    ? [
        task.title || null,
        task.project_label || task.project_id || null,
        task.repo || null
      ].filter(Boolean).join(' • ')
    : 'Task brief editing, evaluation review, and candidate inspection.';
  document.title = task?.title ? `Alloy Operator View - ${task.title}` : 'Alloy Operator View';

  homeLink.href = state.taskId ? `/?task=${encodeURIComponent(state.taskId)}` : '/';
  compareLink.href = state.taskId ? buildCompareUrl(state.taskId) : '/compare.html';
  docsLink.href = buildDocsUrl(state.taskId);
  openCompareButton.disabled = !state.taskId;
  copyRunButton.disabled = !state.taskDetail?.run_dir;
  renderDetail();
  renderEditorMode();
}

function renderMissingTask(error = null) {
  titleRoot.textContent = 'Operator View';
  taskCrumbRoot.textContent = 'New task';
  subtitleRoot.textContent = 'Create a new task file from pasted markdown or point Alloy at an existing markdown file.';
  detailTitle.textContent = 'Create or load a task';
  detailState.textContent = '• draft';
  detailState.className = 'state-pill state-idle';
  detailNav.innerHTML = '';
  taskBrief.innerHTML = '';
  evaluationCall.innerHTML = '';
  comparisonView.innerHTML = '';
  candidateCards.innerHTML = '';
  taskJson.textContent = JSON.stringify({ error: error?.message || null }, null, 2);
  runSummary.textContent = 'No run selected.';

  appendInfoBlock(taskBrief, 'Task Composer', 'Paste markdown into the editor, or point to an existing markdown file path and create a `.task.md` file.');
}

function renderDetail() {
  if (!state.taskDetail && !state.parsedPreview) {
    renderMissingTask();
    return;
  }

  const task = state.parsedPreview || state.taskDetail?.task;
  const comparisonRows = new Map((state.taskDetail?.comparison_view?.rows || []).map((row) => [row.candidate_id, row]));
  const evaluationByCandidateId = new Map((state.taskDetail?.evaluation?.candidates || []).map((candidate) => [candidate.candidate_id, candidate]));

  detailTitle.textContent = task?.title || 'Operator View';
  const detailStatus = state.taskDetail?.latest_run_overview?.status_label || (state.previewValidation?.ok === false ? 'Draft' : 'Prepared');
  detailState.textContent = formatStatusBadge(detailStatus);
  detailState.className = `state-pill ${stateClass(detailStatus)}`;

  renderDetailNav();
  renderTaskBrief(task);
  renderEvaluationCall(state.taskDetail?.latest_run_overview || null, state.taskDetail?.evaluation || null);
  renderComparisonView(state.taskDetail?.comparison_view || null);
  applyDetailSectionVisibility();

  taskJson.textContent = JSON.stringify({
    task,
    validation: state.previewValidation || {},
    run_config: state.taskDetail?.run_config || null,
    merge_view: state.taskDetail?.merge_view || null,
    compare_url: state.taskDetail?.compare_url || (state.taskId ? buildCompareUrl(state.taskId) : null)
  }, null, 2);
  runSummary.textContent = JSON.stringify(state.taskDetail?.latest_run || { message: 'No run yet.' }, null, 2);

  candidateCards.innerHTML = '';
  for (const candidate of state.taskDetail?.candidates || []) {
    const node = candidateTemplate.content.firstElementChild.cloneNode(true);
    const comparison = comparisonRows.get(candidate.candidate_id);
    const evaluation = evaluationByCandidateId.get(candidate.candidate_id);
    const instanceId = candidate.provider_instance_id ? ` • ${candidate.provider_instance_id}` : '';
    node.querySelector('.candidate-label').textContent = `${candidate.candidate_slot} • ${humanizeProvider(candidate.provider)}${instanceId}`;

    const status = candidate.verification?.status === 'pass'
      ? `${candidate.status} / verified`
      : candidate.verification?.status === 'fail'
        ? `${candidate.status} / verification failed`
        : candidate.status;
    node.querySelector('.candidate-status').textContent = formatStatusBadge(status);
    node.querySelector('.candidate-status').className = `candidate-status ${stateClass(status)}`;
    node.querySelector('.candidate-summary').textContent = evaluation?.summary
      || comparison?.summary
      || candidate.summary
      || 'No candidate summary yet.';

    node.querySelector('.candidate-score').textContent = comparison
      ? [
          comparison.score != null ? `Score ${comparison.score}/100` : 'Score pending',
          comparison.eligible ? 'eligible' : 'not eligible',
          `${comparison.changed_file_count} files`,
          `${comparison.total_changed_lines} lines`,
          comparison.jj_change_id ? `jj ${shortId(comparison.jj_change_id)}` : null
        ].filter(Boolean).join(' • ')
      : 'Deterministic evaluation has not run yet.';

    node.querySelector('.candidate-verification').textContent = candidate.verification
      ? candidate.verification.checks.map((check) => `${check.status.toUpperCase()}: ${check.command}`).join(' | ')
      : 'Verification not run yet.';

    const inspectButton = document.createElement('button');
    inspectButton.className = 'ghost-button';
    inspectButton.textContent = 'Open Compare';
    inspectButton.addEventListener('click', () => {
      window.location.href = buildCompareUrl(state.taskId, candidate.candidate_id);
    });
    node.appendChild(inspectButton);
    candidateCards.appendChild(node);
  }
}

function renderDetailNav() {
  detailNav.innerHTML = '';
  const labels = buildDetailSectionLabels();
  for (const section of DETAIL_SECTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = state.detailSection === section.id ? 'detail-tab is-active' : 'detail-tab ghost-button';
    button.textContent = labels.get(section.id) || section.label;
    button.addEventListener('click', () => {
      state.detailSection = section.id;
      applyDetailSectionVisibility();
      renderDetailNav();
    });
    detailNav.appendChild(button);
  }
}

function applyDetailSectionVisibility() {
  const panels = document.querySelectorAll('[data-detail-section]');
  for (const panel of panels) {
    panel.hidden = panel.getAttribute('data-detail-section') !== state.detailSection;
  }
}

function buildDetailSectionLabels() {
  const compareCount = state.taskDetail?.comparison_view?.rows?.length || 0;
  const candidateCount = state.taskDetail?.candidates?.length || 0;

  return new Map([
    ['overview', 'Overview'],
    ['compare', compareCount > 0 ? `Compare (${compareCount})` : 'Compare'],
    ['candidates', candidateCount > 0 ? `Candidates (${candidateCount})` : 'Candidates'],
    ['debug', 'Debug']
  ]);
}

function renderTaskBrief(task) {
  taskBrief.innerHTML = '';
  const validation = state.previewValidation || { ok: true, warnings: [], errors: [] };

  appendInfoBlock(taskBrief, 'Project', task?.project_label ? `${task.project_label} (${task.project_id})` : (task?.project_id || 'No project metadata.'));
  appendInfoBlock(taskBrief, 'Objective', task?.context || task?.title || 'No task title available.');
  appendListBlock(taskBrief, 'Requirements', task?.requirements || [], 'No explicit requirements.');
  appendListBlock(taskBrief, 'Constraints', task?.constraints || [], 'No explicit constraints.');
  appendListBlock(taskBrief, 'Acceptance Checks', task?.acceptance_checks || [], 'No acceptance checks declared.');
  appendListBlock(taskBrief, 'Operator Notes', task?.human_notes || [], 'No operator notes.');

  const routing = document.createElement('div');
  routing.className = 'info-block';
  const title = document.createElement('h4');
  title.textContent = 'Routing';
  const value = document.createElement('p');
  value.textContent = [
    `Mode ${task?.mode || 'unknown'}`,
    `Blind review ${humanizeProvider(state.taskDetail?.run_config?.judge || task?.judge || 'none')}`,
    `Review ${task?.human_review_policy || 'standard'}`,
    `Publish ${task?.publish_policy || 'manual'}`
  ].join(' • ');
  routing.append(title, value);
  taskBrief.appendChild(routing);

  const validationBlock = document.createElement('div');
  validationBlock.className = 'info-block';
  const validationTitle = document.createElement('h4');
  validationTitle.textContent = 'Validation';
  const validationText = document.createElement('p');
  const messages = [];
  messages.push(validation.ok ? 'Parsed cleanly.' : 'Parse issues detected.');
  if (validation.warnings?.length) {
    messages.push(`Warnings: ${validation.warnings.join(' | ')}`);
  }
  if (validation.errors?.length) {
    messages.push(`Errors: ${validation.errors.join(' | ')}`);
  }
  validationText.textContent = messages.join(' ');
  validationBlock.append(validationTitle, validationText);
  taskBrief.appendChild(validationBlock);

  const composerBlock = document.createElement('div');
  composerBlock.className = 'info-block';
  const composerTitle = document.createElement('h4');
  composerTitle.textContent = 'Create Task File';
  const composerText = document.createElement('p');
  composerText.textContent = 'Paste markdown into the editor, or provide a source file path, then create a new `.task.md` file inside `samples/tasks`.';
  const composerControls = document.createElement('div');
  composerControls.className = 'provider-config-controls';

  const filenameLabel = document.createElement('label');
  filenameLabel.textContent = 'Output File Name';
  createTaskFilenameInput.placeholder = 'my-new-task.task.md';
  filenameLabel.appendChild(createTaskFilenameInput);

  const sourceLabel = document.createElement('label');
  sourceLabel.textContent = 'Source File Path';
  createTaskSourceInput.placeholder = 'path/to/task.md';
  sourceLabel.appendChild(createTaskSourceInput);

  composerControls.append(filenameLabel, sourceLabel);
  composerBlock.append(composerTitle, composerText, composerControls, createTaskButton);
  taskBrief.appendChild(composerBlock);
}

function renderEvaluationCall(overview, evaluation) {
  evaluationCall.innerHTML = '';
  const rationale = evaluation?.judge_rationale || state.taskDetail?.judge_rationale || null;

  appendInfoBlock(
    evaluationCall,
    'Current Read',
    overview?.decision_summary || 'No evaluator decision is available yet.'
  );
  appendInfoBlock(
    evaluationCall,
    'Execution Status',
    overview?.execution_summary || 'No run execution summary is available.'
  );
  appendInfoBlock(
    evaluationCall,
    'Run Provenance',
    [
      overview?.run_origin_label || 'No run',
      overview?.run_origin_detail || null,
      overview?.proof_level ? `proof ${overview.proof_level}` : null
    ].filter(Boolean).join(' • ')
  );
  appendInfoBlock(
    evaluationCall,
    'Provider Plan',
    overview?.provider_plan || 'No provider plan is available.'
  );
  appendInfoBlock(
    evaluationCall,
    'Acceptance',
    overview?.acceptance_summary || 'No acceptance summary is available.'
  );

  if (rationale) {
    appendInfoBlock(evaluationCall, 'Judge Overview', rationale.overview);
    appendInfoBlock(evaluationCall, 'Next Action', rationale.next_action);

    const riskLines = (rationale.risk_flags || []).map((flag) => [
      flag.severity.toUpperCase(),
      flag.path || null,
      flag.message
    ].filter(Boolean).join(' • '));
    appendListBlock(
      evaluationCall,
      'Risk Flags',
      riskLines,
      'No major deterministic risks flagged.'
    );
  }

  const finalists = evaluation?.decision?.finalists || overview?.finalists || [];
  appendListBlock(
    evaluationCall,
    'Finalists',
    finalists.map((finalist) => `${finalist.label} • ${finalist.score}/100`),
    'No finalists yet.'
  );
}

function renderComparisonView(comparison) {
  comparisonView.innerHTML = '';
  if (!comparison) {
    appendInfoBlock(comparisonView, 'Decision', 'No comparison view is available yet.');
    return;
  }
  const mergeView = state.taskDetail?.merge_view || null;
  const publication = state.taskDetail?.publication_view || mergeView?.publication || null;
  const blindReview = comparison.blind_review || null;
  const composerPlan = comparison.composer_plan || null;
  const agentBlindReviews = comparison.agent_blind_reviews || [];

  appendInfoBlock(comparisonView, 'Decision', comparison.decision?.summary || 'No evaluator decision is available yet.');
  appendInfoBlock(comparisonView, 'Synthesis Guidance', comparison.decision?.synthesis_summary || 'Synthesis guidance is not available yet.');

  if (comparison.judge_rationale) {
    appendInfoBlock(comparisonView, 'Judge Overview', comparison.judge_rationale.overview);
    appendInfoBlock(comparisonView, 'Next Action', comparison.judge_rationale.next_action);
  }

  if (blindReview) {
    appendInfoBlock(
      comparisonView,
      'Blind Review',
      [
        blindReview.decision?.mode || 'pending',
        blindReview.decision?.confidence ? `confidence ${blindReview.decision.confidence}` : null,
        blindReview.decision?.winner?.label || null
      ].filter(Boolean).join(' • ')
    );
  }

  if (composerPlan) {
    appendInfoBlock(
      comparisonView,
      'Composer Plan',
      [
        composerPlan.mode,
        composerPlan.confidence ? `confidence ${composerPlan.confidence}` : null,
        composerPlan.review_required ? 'human review required' : 'review optional'
      ].filter(Boolean).join(' • ')
    );
  }

  if (agentBlindReviews.length > 0) {
    appendListBlock(
      comparisonView,
      'Agent Blind Reviews',
      agentBlindReviews.map((review) => (
        [
          review.provider,
          review.status,
          review.recommendation?.recommended_mode || null,
          review.recommendation?.confidence ? `confidence ${review.recommendation.confidence}` : null
        ].filter(Boolean).join(' • ')
      )),
      'No blind agent review has been run yet.'
    );
  }

  if (publication) {
    appendInfoBlock(
      comparisonView,
      'Publication',
      [
        publication.status || null,
        publication.summary || null,
        publication.target_branch_or_bookmark || null
      ].filter(Boolean).join(' • ')
    );
  }

  const compareButtonBlock = document.createElement('div');
  compareButtonBlock.className = 'info-block';
  const compareButtonTitle = document.createElement('h4');
  compareButtonTitle.textContent = 'Compare Surface';
  const compareButtonBody = document.createElement('p');
  compareButtonBody.textContent = 'Open the dedicated compare page for candidate patches, synthesized diffs, per-file provenance, and finalization controls.';
  const compareButton = document.createElement('a');
  compareButton.className = 'ghost-button';
  compareButton.href = state.taskId ? buildCompareUrl(state.taskId) : '/compare.html';
  compareButton.textContent = 'Open Compare Diffs';
  compareButtonBlock.append(compareButtonTitle, compareButtonBody, compareButton);
  comparisonView.appendChild(compareButtonBlock);
}

function renderMarkdownPreview() {
  renderMarkdownInto(taskMarkdownPreview, stripFrontmatter(taskMarkdown.value || ''));
}

function renderEditorMode() {
  const previewMode = state.editorMode === 'preview';
  taskMarkdown.hidden = previewMode;
  taskMarkdownPreview.hidden = !previewMode;
  taskMarkdownEditTab.className = previewMode ? 'detail-tab ghost-button' : 'detail-tab is-active';
  taskMarkdownPreviewTab.className = previewMode ? 'detail-tab is-active' : 'detail-tab ghost-button';
}

function stripFrontmatter(markdown) {
  const normalized = String(markdown || '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return normalized;
  }
  const end = normalized.indexOf('\n---\n', 4);
  if (end < 0) {
    return normalized;
  }
  return normalized.slice(end + 5).trimStart();
}

function buildCompareUrl(taskId, candidateId = null) {
  const params = new URLSearchParams({ task: taskId });
  if (candidateId) {
    params.set('candidate', candidateId);
  }
  return `/compare.html?${params.toString()}`;
}

function buildOperatorUrl(taskId = null) {
  const params = new URLSearchParams();
  if (taskId) {
    params.set('task', taskId);
  }
  const query = params.toString();
  return query ? `/operator.html?${query}` : '/operator.html';
}

function buildDocsUrl(taskId = null) {
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

function humanizeProvider(provider) {
  switch (provider) {
    case 'claude-code':
      return 'Claude Code';
    case 'gemini':
      return 'Gemini CLI';
    case 'codex':
      return 'Codex';
    case 'none':
      return 'Deterministic Only';
    default:
      return provider || 'unknown';
  }
}

function shortId(value) {
  return value ? value.slice(0, 12) : '';
}

function displayState(value) {
  return String(value || 'unknown').replace(/_/g, ' ');
}

function formatStatusBadge(value, { provider = null } = {}) {
  const normalized = String(value || 'unknown').toLowerCase();
  const label = displayState(value);

  if (provider === 'gemini' || normalized.includes('manual') || normalized.includes('unknown')) {
    return `? ${label}`;
  }
  if (normalized.includes('fail') || normalized.includes('invalid') || normalized.includes('blocked') || normalized.includes('not installed') || normalized.includes('not_installed') || normalized.includes('no winner')) {
    return `✕ ${label}`;
  }
  if (normalized.includes('ready') || normalized.includes('pass') || normalized.includes('valid') || normalized.includes('published') || normalized.includes('verified') || normalized.includes('synthesized')) {
    return `✓ ${label}`;
  }
  return `• ${label}`;
}

function stateClass(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('fail') || normalized.includes('invalid') || normalized.includes('blocked') || normalized.includes('not_installed') || normalized.includes('no winner')) {
    return 'state-danger';
  }
  if (normalized.includes('ready') || normalized.includes('pass') || normalized.includes('valid') || normalized.includes('published') || normalized.includes('verified') || normalized.includes('synthesized')) {
    return 'state-success';
  }
  if (normalized.includes('unknown') || normalized.includes('manual') || normalized.includes('prepared') || normalized.includes('previewed') || normalized.includes('running') || normalized.includes('judging') || normalized.includes('pending') || normalized.includes('merge')) {
    return 'state-warn';
  }
  return 'state-idle';
}

function relativeTaskPath() {
  if (!state.taskDetail?.markdown_path) {
    return null;
  }
  const normalized = state.taskDetail.markdown_path.replace(/\\/g, '/');
  const marker = '/stack-judge/';
  const index = normalized.indexOf(marker);
  return index >= 0 ? normalized.slice(index + marker.length) : null;
}

function showToast({ title, lines = [], tone = 'info', timeoutMs = 7000 }) {
  const toast = document.createElement('article');
  toast.className = `toast toast-${tone}`;

  const heading = document.createElement('strong');
  heading.textContent = title;
  toast.appendChild(heading);

  for (const line of lines.filter(Boolean)) {
    const paragraph = document.createElement('p');
    paragraph.textContent = line;
    toast.appendChild(paragraph);
  }

  const dismiss = document.createElement('button');
  dismiss.className = 'toast-dismiss ghost-button';
  dismiss.type = 'button';
  dismiss.textContent = 'Dismiss';
  dismiss.addEventListener('click', () => toast.remove());
  toast.appendChild(dismiss);

  toastStack.prepend(toast);
  window.setTimeout(() => toast.remove(), timeoutMs);
}
