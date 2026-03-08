import { renderMarkdownInto } from './markdown-viewer.mjs';
import {
  buildTaskTemplateDraft,
  buildDraftFromTask,
  buildTaskMarkdownFromDraft,
  createEmptyTaskDraft,
  formatMultilineList,
  getTaskTemplatePreset,
  parseMultilineList,
  validateTaskDraft
} from './task-composer.mjs';
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
  taskCatalog: [],
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
const taskCatalog = document.querySelector('#task-catalog');
const composerTemplateSummary = document.querySelector('#composer-template-summary');
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
const createTaskFromSourceButton = document.querySelector('#create-task-file-source');
const createTaskFilenameInput = document.querySelector('#create-task-filename');
const createTaskSourceInput = document.querySelector('#create-task-source');
const composerFillCurrentButton = document.querySelector('#composer-fill-current');
const composerLoadSourceButton = document.querySelector('#composer-load-source');
const composerWriteEditorButton = document.querySelector('#composer-write-editor');
const composerResetTemplateButton = document.querySelector('#composer-reset-template');
const composerApplyTemplateButton = document.querySelector('#composer-apply-template');
const composerApplyGreenfieldButton = document.querySelector('#composer-apply-greenfield');
const composerApplyExistingButton = document.querySelector('#composer-apply-existing');
const composerLoadDemoButton = document.querySelector('#composer-load-demo');
const composerOpenDemoButton = document.querySelector('#composer-open-demo');
const toastStack = document.querySelector('#toast-stack');
const candidateTemplate = document.querySelector('#candidate-template');
const composerInputs = {
  task_template: document.querySelector('#composer-template'),
  bootstrap_style: document.querySelector('#composer-bootstrap-style'),
  init_command: document.querySelector('#composer-init-command'),
  demo_task_id: document.querySelector('#composer-demo-task'),
  title: document.querySelector('#composer-title'),
  task_id: document.querySelector('#composer-task-id'),
  project_id: document.querySelector('#composer-project-id'),
  project_label: document.querySelector('#composer-project-label'),
  repo: document.querySelector('#composer-repo'),
  repo_path: document.querySelector('#composer-repo-path'),
  base_ref: document.querySelector('#composer-base-ref'),
  max_runtime_minutes: document.querySelector('#composer-runtime'),
  mode: document.querySelector('#composer-mode'),
  judge: document.querySelector('#composer-judge'),
  risk_level: document.querySelector('#composer-risk'),
  human_review_policy: document.querySelector('#composer-review-policy'),
  publish_policy: document.querySelector('#composer-publish-policy'),
  synthesis_policy: document.querySelector('#composer-synthesis-policy'),
  context: document.querySelector('#composer-context'),
  requirements: document.querySelector('#composer-requirements'),
  constraints: document.querySelector('#composer-constraints'),
  acceptance_checks: document.querySelector('#composer-acceptance-checks'),
  optional_guidance: document.querySelector('#composer-guidance'),
  human_notes: document.querySelector('#composer-human-notes'),
  providers: {
    codex: document.querySelector('#composer-provider-codex'),
    gemini: document.querySelector('#composer-provider-gemini'),
    'claude-code': document.querySelector('#composer-provider-claude-code')
  }
};

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
    window.location.href = buildReviewUrl(state.taskId);
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
createTaskFromSourceButton.addEventListener('click', () => createTaskFile({ sourceMode: 'editor' }));
composerFillCurrentButton.addEventListener('click', () => loadCurrentTaskIntoComposer());
composerLoadSourceButton.addEventListener('click', () => loadSourceIntoEditor());
composerWriteEditorButton.addEventListener('click', () => writeComposerToEditor({ showToast: true }));
composerResetTemplateButton.addEventListener('click', () => resetComposerTemplate(true));
composerApplyTemplateButton.addEventListener('click', () => applyTemplatePreset(composerInputs.task_template.value));
composerApplyGreenfieldButton.addEventListener('click', () => applyTemplatePreset('greenfield_init'));
composerApplyExistingButton.addEventListener('click', () => applyTemplatePreset('existing_repo_bugfix'));
composerLoadDemoButton.addEventListener('click', () => loadDemoIntoSetup());
composerOpenDemoButton.addEventListener('click', () => openSelectedDemo());
composerInputs.task_template.addEventListener('change', () => renderTemplateSummary());
composerInputs.bootstrap_style.addEventListener('change', () => renderTemplateSummary());
composerInputs.init_command.addEventListener('input', () => renderTemplateSummary());

boot().catch((error) => {
  renderMissingTask(error);
  showToast({
    title: 'Tasks page failed to load',
    lines: [error.message || String(error)],
    tone: 'danger',
    timeoutMs: 9000
  });
});

async function boot() {
  await loadTaskCatalog();
  if (state.taskId) {
    await loadTaskDetail();
  } else {
    state.taskDetail = null;
    state.parsedPreview = null;
    state.previewValidation = null;
    taskMarkdown.value = '';
    renderMarkdownPreview();
    resetComposerTemplate(false);
    writeComposerToEditor({ showToast: false });
  }
  renderPage();
}

async function loadTaskCatalog() {
  const response = await fetch('/api/tasks/catalog');
  const payload = await response.json();
  state.taskCatalog = payload.tasks || [];
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
  writeComposerDraft(buildDraftFromTask(state.taskDetail.task));
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

function renderPage() {
  const task = state.parsedPreview || state.taskDetail?.task || null;
  titleRoot.textContent = 'Tasks';
  taskCrumbRoot.textContent = task?.title || 'New task';
  subtitleRoot.textContent = task
    ? [
        task.title || null,
        task.project_label || task.project_id || null,
        task.repo || null
      ].filter(Boolean).join(' • ')
    : 'Task authoring, queue management, candidate inspection, and run setup.';
  document.title = task?.title ? `Alloy Tasks - ${task.title}` : 'Alloy Tasks';

  homeLink.href = state.taskId ? `/?task=${encodeURIComponent(state.taskId)}` : '/';
  compareLink.href = state.taskId ? buildReviewUrl(state.taskId) : '/review.html';
  docsLink.href = buildDocsUrl(state.taskId);
  openCompareButton.disabled = !state.taskId;
  copyRunButton.disabled = !state.taskDetail?.run_dir;
  renderDemoOptions();
  renderTemplateSummary();
  renderTaskCatalog();
  renderDetail();
  renderEditorMode();
}

function renderMissingTask(error = null) {
  titleRoot.textContent = 'Tasks';
  taskCrumbRoot.textContent = 'New task';
  subtitleRoot.textContent = 'Create a new task from guided fields, generate task source, or import a trusted local markdown file.';
  detailTitle.textContent = 'Create or load a task';
  detailState.textContent = '• draft';
  detailState.className = 'state-pill state-idle';
  detailNav.innerHTML = '';
  taskBrief.innerHTML = '';
  evaluationCall.innerHTML = '';
  comparisonView.innerHTML = '';
  candidateCards.innerHTML = '';
  renderTaskCatalog();
  taskJson.textContent = JSON.stringify({ error: error?.message || null }, null, 2);
  runSummary.textContent = 'No run selected.';

  appendInfoBlock(taskBrief, 'Task Setup', 'Use Guided Fields first. Generate task source only after the project target, acceptance checks, and queue plan look sane.');
}

function renderTaskCatalog() {
  taskCatalog.innerHTML = '';
  appendInlineHint(taskCatalog, 'Demo scenarios are seed markdown tasks. They are safe to load, duplicate, queue, or delete from the filesystem once you understand the workflow.');
  if (!state.taskCatalog.length) {
    appendInlineHint(taskCatalog, 'No task files found. Create one from the structured form or import a trusted markdown file.');
    return;
  }

  const demoTasks = state.taskCatalog.filter((task) => task.is_demo);
  const customTasks = state.taskCatalog.filter((task) => !task.is_demo);

  if (demoTasks.length) {
    taskCatalog.appendChild(renderTaskCatalogSection({
      heading: 'Demo Scenarios',
      hint: 'Seed examples for Alloy. Load them into the editor, queue them, or use them as starting points for custom tasks.',
      tasks: demoTasks
    }));
  }

  taskCatalog.appendChild(renderTaskCatalogSection({
    heading: customTasks.length ? 'Saved Tasks' : 'Saved Tasks',
    hint: customTasks.length ? 'Tasks you created or imported live here.' : 'No saved custom tasks yet.',
    tasks: customTasks
  }));
}

function renderTaskCatalogSection({ heading, hint, tasks }) {
  const section = document.createElement('section');
  section.className = 'stack compact';

  const title = document.createElement('h4');
  title.textContent = heading;
  section.appendChild(title);

  if (hint) {
    appendInlineHint(section, hint);
  }

  if (!tasks.length) {
    return section;
  }

  for (const task of tasks) {
    const card = document.createElement('article');
    card.className = 'info-block';

    const top = document.createElement('div');
    top.className = 'candidate-header';
    const title = document.createElement('h4');
    title.textContent = task.title;
    const status = document.createElement('span');
    status.textContent = formatStatusBadge(task.queued ? (task.queue_status || 'queued') : 'not queued');
    status.className = `candidate-status ${stateClass(task.queued ? (task.queue_status || 'queued') : 'draft')}`;
    top.append(title, status);

    const meta = document.createElement('p');
    meta.textContent = [
      task.is_demo ? 'demo task' : 'custom task',
      task.project_label || task.project_id,
      task.repo,
      task.queued ? `queued ${task.queued_at || 'yes'}` : 'not queued'
    ].filter(Boolean).join(' • ');

    const summary = document.createElement('p');
    summary.textContent = task.card_summary || task.objective || 'No summary.';

    const actions = document.createElement('div');
    actions.className = 'task-chip-row';

    const loadButton = document.createElement('button');
    loadButton.className = 'ghost-button';
    loadButton.textContent = state.taskId === task.task_id ? 'Loaded' : 'Open Task';
    loadButton.disabled = state.taskId === task.task_id;
    loadButton.addEventListener('click', () => {
      window.location.href = buildTasksUrl(task.task_id);
    });

    const fillButton = document.createElement('button');
    fillButton.className = 'ghost-button';
    fillButton.textContent = 'Load Into Setup';
    fillButton.addEventListener('click', () => {
      writeComposerDraft(buildDraftFromTask(task));
      renderTemplateSummary();
      showToast({
        title: 'Task loaded into setup',
        lines: [task.title]
      });
    });

    const queueButton = document.createElement('button');
    queueButton.className = 'ghost-button';
    queueButton.textContent = task.queued ? 'Remove From Queue' : 'Add To Queue';
    queueButton.addEventListener('click', async () => {
      if (task.queued) {
        await dequeueTask(task.task_id);
      } else {
        await enqueueTask(task.task_id);
      }
    });

    actions.append(loadButton, fillButton, queueButton);
    card.append(top, meta, summary, actions);
    section.appendChild(card);
  }

  return section;
}

function renderDetail() {
  if (!state.taskDetail && !state.parsedPreview) {
    renderMissingTask();
    return;
  }

  const task = state.parsedPreview || state.taskDetail?.task;
  const comparisonRows = new Map((state.taskDetail?.comparison_view?.rows || []).map((row) => [row.candidate_id, row]));
  const evaluationByCandidateId = new Map((state.taskDetail?.evaluation?.candidates || []).map((candidate) => [candidate.candidate_id, candidate]));

  detailTitle.textContent = task?.title || 'Tasks';
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
    compare_url: state.taskDetail?.compare_url || (state.taskId ? buildReviewUrl(state.taskId) : null)
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
    inspectButton.textContent = 'Open Review';
    inspectButton.addEventListener('click', () => {
      window.location.href = buildReviewUrl(state.taskId, candidate.candidate_id);
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
    messages.push(`Warnings: ${formatValidationMessages(validation.warnings).join(' | ')}`);
  }
  if (validation.errors?.length) {
    messages.push(`Errors: ${formatValidationMessages(validation.errors).join(' | ')}`);
  }
  validationText.textContent = messages.join(' ');
  validationBlock.append(validationTitle, validationText);
  taskBrief.appendChild(validationBlock);
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
  compareButtonTitle.textContent = 'Review Surface';
  const compareButtonBody = document.createElement('p');
  compareButtonBody.textContent = 'Open the dedicated compare page for candidate patches, synthesized diffs, per-file provenance, and finalization controls.';
  const compareButton = document.createElement('a');
  compareButton.className = 'ghost-button';
  compareButton.href = state.taskId ? buildReviewUrl(state.taskId) : '/review.html';
  compareButton.textContent = 'Open Review';
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

function buildReviewUrl(taskId, candidateId = null) {
  const params = new URLSearchParams({ task: taskId });
  if (candidateId) {
    params.set('candidate', candidateId);
  }
  return `/review.html?${params.toString()}`;
}

function buildTasksUrl(taskId = null) {
  const params = new URLSearchParams();
  if (taskId) {
    params.set('task', taskId);
  }
  const query = params.toString();
  return query ? `/tasks.html?${query}` : '/tasks.html';
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

function appendInlineHint(root, text) {
  const paragraph = document.createElement('p');
  paragraph.className = 'hint';
  paragraph.textContent = text;
  root.appendChild(paragraph);
}

function readComposerDraft() {
  return {
    title: composerInputs.title.value,
    task_template: composerInputs.task_template.value,
    bootstrap_style: composerInputs.bootstrap_style.value,
    init_command: composerInputs.init_command.value,
    task_id: composerInputs.task_id.value,
    project_id: composerInputs.project_id.value,
    project_label: composerInputs.project_label.value,
    repo: composerInputs.repo.value,
    repo_path: composerInputs.repo_path.value,
    base_ref: composerInputs.base_ref.value,
    max_runtime_minutes: composerInputs.max_runtime_minutes.value,
    mode: composerInputs.mode.value,
    judge: composerInputs.judge.value,
    risk_level: composerInputs.risk_level.value,
    human_review_policy: composerInputs.human_review_policy.value,
    publish_policy: composerInputs.publish_policy.value,
    synthesis_policy: composerInputs.synthesis_policy.value,
    context: composerInputs.context.value,
    requirements: parseMultilineList(composerInputs.requirements.value),
    constraints: parseMultilineList(composerInputs.constraints.value),
    acceptance_checks: parseMultilineList(composerInputs.acceptance_checks.value),
    optional_guidance: parseMultilineList(composerInputs.optional_guidance.value),
    human_notes: parseMultilineList(composerInputs.human_notes.value),
    providers: Object.entries(composerInputs.providers)
      .filter(([, input]) => input.checked)
      .map(([provider]) => provider)
  };
}

function writeComposerDraft(draft) {
  const next = buildDraftFromTask(draft);
  composerInputs.task_template.value = next.task_template && getTaskTemplatePreset(next.task_template)
    ? next.task_template
    : 'existing_repo_bugfix';
  composerInputs.bootstrap_style.value = next.bootstrap_style || 'existing_repo';
  composerInputs.init_command.value = next.init_command || '/init';
  composerInputs.title.value = next.title;
  composerInputs.task_id.value = next.task_id;
  composerInputs.project_id.value = next.project_id;
  composerInputs.project_label.value = next.project_label;
  composerInputs.repo.value = next.repo;
  composerInputs.repo_path.value = next.repo_path;
  composerInputs.base_ref.value = next.base_ref;
  composerInputs.max_runtime_minutes.value = String(next.max_runtime_minutes);
  composerInputs.mode.value = next.mode;
  composerInputs.judge.value = next.judge;
  composerInputs.risk_level.value = next.risk_level;
  composerInputs.human_review_policy.value = next.human_review_policy;
  composerInputs.publish_policy.value = next.publish_policy;
  composerInputs.synthesis_policy.value = next.synthesis_policy;
  composerInputs.context.value = next.context;
  composerInputs.requirements.value = formatMultilineList(next.requirements);
  composerInputs.constraints.value = formatMultilineList(next.constraints);
  composerInputs.acceptance_checks.value = formatMultilineList(next.acceptance_checks);
  composerInputs.optional_guidance.value = formatMultilineList(next.optional_guidance);
  composerInputs.human_notes.value = formatMultilineList(next.human_notes);
  for (const [provider, input] of Object.entries(composerInputs.providers)) {
    input.checked = next.providers.includes(provider);
  }
}

function loadCurrentTaskIntoComposer() {
  const sourceTask = state.parsedPreview || state.taskDetail?.task;
  writeComposerDraft(sourceTask ? buildDraftFromTask(sourceTask) : createEmptyTaskDraft());
  renderTemplateSummary();
  showToast({
    title: 'Task fields loaded',
    lines: [sourceTask?.title || 'Empty template']
  });
}

function resetComposerTemplate(showFeedback = true) {
  writeComposerDraft(buildTaskTemplateDraft('existing_repo_bugfix'));
  createTaskFilenameInput.value = '';
  createTaskSourceInput.value = '';
  renderTemplateSummary();
  if (showFeedback) {
    showToast({
      title: 'Task fields reset',
      lines: ['Existing-repo bugfix template restored.']
    });
  }
}

function applyTemplatePreset(presetId) {
  const draft = readComposerDraft();
  const next = buildTaskTemplateDraft(presetId, {
    title: draft.title || undefined,
    task_id: draft.task_id || undefined,
    project_id: draft.project_id || undefined,
    project_label: draft.project_label || undefined,
    repo: draft.repo || undefined,
    repo_path: draft.repo_path || undefined,
    init_command: draft.init_command || undefined
  });
  writeComposerDraft(next);
  renderTemplateSummary();
  showToast({
    title: 'Task template applied',
    lines: [getTaskTemplatePreset(presetId)?.label || presetId]
  });
}

async function loadSourceIntoEditor() {
  const sourcePath = createTaskSourceInput.value.trim();
  if (!sourcePath) {
    showToast({
      title: 'Source path required',
      lines: ['Set Source File Path to a trusted local markdown file first.'],
      tone: 'warn'
    });
    return;
  }

  try {
    const response = await fetch('/api/tasks/import-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_path: sourcePath
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'task_source_load_failed');
    }

    taskMarkdown.value = payload.markdown || '';
    await parseMarkdownPreview(taskMarkdown.value);
    renderMarkdownPreview();
    writeComposerDraft(buildDraftFromTask(payload.task || {}));
    renderTemplateSummary();
    showToast({
      title: 'Source loaded into editor',
      lines: [sourcePath, ...(payload.security_warnings || [])]
    });
  } catch (error) {
    showToast({
      title: 'Source load failed',
      lines: [error.message || String(error)],
      tone: 'danger'
    });
  }
}

function writeComposerToEditor({ showToast: shouldToast }) {
  try {
    const validation = validateTaskDraft(readComposerDraft());
    if (!validation.ok) {
      throw new Error(validation.errors.join(' | '));
    }
    taskMarkdown.value = buildTaskMarkdownFromDraft(validation.normalized);
    parseMarkdownPreview(taskMarkdown.value);
    renderMarkdownPreview();
    renderTemplateSummary();
    if (shouldToast) {
      showToast({
        title: 'Markdown updated from fields',
        lines: [
          validation.normalized.task_id,
          ...(validation.warnings || [])
        ]
      });
    }
  } catch (error) {
    showToast({
      title: 'Task fields are incomplete',
      lines: [error.message || String(error)],
      tone: 'danger'
    });
  }
}

async function enqueueTask(taskId) {
  try {
    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/queue/enqueue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queued_by: 'tasks-ui',
        run_config: state.taskDetail?.task_id === taskId ? state.taskDetail?.run_config || null : null
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'queue_enqueue_failed');
    }
    await loadTaskCatalog();
    showToast({
      title: 'Task queued',
      lines: [taskId]
    });
    renderTaskCatalog();
  } catch (error) {
    showToast({
      title: 'Queue update failed',
      lines: [error.message || String(error)],
      tone: 'danger'
    });
  }
}

async function createTaskFile(options = {}) {
  try {
    let markdown = taskMarkdown.value.trim();
    if (options.sourceMode !== 'editor' || !markdown) {
      const validation = validateTaskDraft(readComposerDraft());
      if (!validation.ok) {
        throw new Error(validation.errors.join(' | '));
      }
      markdown = buildTaskMarkdownFromDraft(validation.normalized);
      taskMarkdown.value = markdown;
      renderMarkdownPreview();
      await parseMarkdownPreview(markdown);
    }

    const response = await fetch('/api/tasks/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        output_name: createTaskFilenameInput.value.trim(),
        source_path: createTaskSourceInput.value.trim() || null,
        markdown
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

    window.location.href = buildTasksUrl(payload.task_id);
  } catch (error) {
    showToast({
      title: 'Task file creation failed',
      lines: [error.message || String(error)],
      tone: 'danger'
    });
  }
}

async function dequeueTask(taskId) {
  try {
    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/queue/dequeue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'queue_dequeue_failed');
    }
    await loadTaskCatalog();
    showToast({
      title: payload.removed ? 'Task removed from queue' : 'Task was not queued',
      lines: [taskId]
    });
    renderTaskCatalog();
  } catch (error) {
    showToast({
      title: 'Queue update failed',
      lines: [error.message || String(error)],
      tone: 'danger'
    });
  }
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

function renderTemplateSummary() {
  composerTemplateSummary.innerHTML = '';
  const preset = getTaskTemplatePreset(composerInputs.task_template.value);
  const bootstrapStyle = composerInputs.bootstrap_style.value || 'existing_repo';
  const initCommand = composerInputs.init_command.value.trim() || '/init';
  const selectedDemo = state.taskCatalog.find((task) => task.task_id === composerInputs.demo_task_id.value);

  appendInfoBlock(
    composerTemplateSummary,
    'Current Template',
    preset
      ? `${preset.label} • ${preset.description}`
      : 'Custom task fields are active.'
  );
  appendInfoBlock(
    composerTemplateSummary,
    'Workspace Bootstrap',
    bootstrapStyle === 'greenfield'
      ? `Greenfield workspace. Generated guidance will tell agents to start with ${initCommand} or their equivalent bootstrap command.`
      : bootstrapStyle === 'existing_repo'
        ? `Existing repository. Generated guidance will tell agents to start with ${initCommand} or their equivalent repository-understanding command.`
        : 'No bootstrap hint will be generated.'
  );
  appendInfoBlock(
    composerTemplateSummary,
    'Save Behavior',
    'Save Task File generates markdown from the guided fields first. Save Current Source As File preserves manual markdown edits exactly as shown in Task Source.'
  );
  appendInfoBlock(
    composerTemplateSummary,
    'Demo Loader',
    selectedDemo
      ? `Selected demo: ${selectedDemo.title}. Use Load Demo Into Setup to copy it into the guided fields or Open Demo to inspect the saved task directly.`
      : 'Choose a demo scenario above if you want a quick starting point without importing or writing task source manually.'
  );
}

function renderDemoOptions() {
  const currentValue = composerInputs.demo_task_id.value;
  const demoTasks = state.taskCatalog.filter((task) => task.is_demo);
  composerInputs.demo_task_id.innerHTML = '<option value="">Select a demo task</option>';
  for (const task of demoTasks) {
    const option = document.createElement('option');
    option.value = task.task_id;
    option.textContent = `${task.title} (${task.project_label || task.project_id})`;
    composerInputs.demo_task_id.appendChild(option);
  }
  if (demoTasks.some((task) => task.task_id === currentValue)) {
    composerInputs.demo_task_id.value = currentValue;
  } else if (!currentValue && demoTasks[0]) {
    composerInputs.demo_task_id.value = demoTasks[0].task_id;
  }
}

function loadDemoIntoSetup() {
  const task = state.taskCatalog.find((entry) => entry.task_id === composerInputs.demo_task_id.value);
  if (!task) {
    showToast({
      title: 'Demo task required',
      lines: ['Select a demo scenario first.'],
      tone: 'warn'
    });
    return;
  }
  writeComposerDraft(buildDraftFromTask(task));
  renderTemplateSummary();
  showToast({
    title: 'Demo loaded into setup',
    lines: [task.title]
  });
}

function openSelectedDemo() {
  const taskId = composerInputs.demo_task_id.value;
  if (!taskId) {
    showToast({
      title: 'Demo task required',
      lines: ['Select a demo scenario first.'],
      tone: 'warn'
    });
    return;
  }
  window.location.href = buildTasksUrl(taskId);
}

function formatValidationMessages(entries) {
  return (entries || []).map((entry) => (
    typeof entry === 'string' ? entry : entry?.message || JSON.stringify(entry)
  ));
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
