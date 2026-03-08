import { renderMarkdownInto } from './markdown-viewer.mjs';
import { DETAIL_SECTIONS, normalizeDetailSection, paginateItems } from './view-state.mjs';

const searchParams = new URLSearchParams(window.location.search);

const state = {
  tasks: [],
  selectedTaskId: null,
  taskDetail: null,
  providers: null,
  runConfig: null,
  parsedPreview: null,
  previewValidation: null,
  liveSessions: [],
  projectFilter: 'all',
  boardGrouping: 'project',
  boardPage: 1,
  boardPageSize: 6,
  detailSection: 'overview',
  editorMode: 'source',
  runPollTimer: null,
  runInFlight: false
};

const board = document.querySelector('#task-board');
const boardControls = document.querySelector('#board-controls');
const providers = document.querySelector('#providers');
const runConfigRoot = document.querySelector('#run-config');
const runPolicyRoot = document.querySelector('#run-policy');
const runConfigSummary = document.querySelector('#run-config-summary');
const sessionList = document.querySelector('#session-list');
const boardSummary = document.querySelector('#board-summary');
const detailTitle = document.querySelector('#detail-title');
const detailState = document.querySelector('#detail-state');
const detailNav = document.querySelector('#detail-nav');
const taskMarkdown = document.querySelector('#task-markdown');
const taskBrief = document.querySelector('#task-brief');
const evaluationCall = document.querySelector('#evaluation-call');
const comparisonView = document.querySelector('#comparison-view');
const taskJson = document.querySelector('#task-json');
const runSummary = document.querySelector('#run-summary');
const candidateCards = document.querySelector('#candidate-cards');
const toastStack = document.querySelector('#toast-stack');
const heroOpenCompareButton = document.querySelector('#hero-open-compare');
const heroOpenDocsLink = document.querySelector('#hero-open-docs');
const detailOpenCompareButton = document.querySelector('#detail-open-compare');
const taskMarkdownEditTab = document.querySelector('#task-markdown-edit-tab');
const taskMarkdownPreviewTab = document.querySelector('#task-markdown-preview-tab');
const taskMarkdownPreview = document.querySelector('#task-markdown-preview');
const prepareButton = document.querySelector('#prepare-task');
const runButton = document.querySelector('#run-task');
const runLiveButton = document.querySelector('#run-task-live');
const openCompareButton = document.querySelector('#open-compare-page');
const openLatestRunButton = document.querySelector('#open-latest-run');

const providerTemplate = document.querySelector('#provider-template');
const runConfigTemplate = document.querySelector('#run-config-template');
const candidateTemplate = document.querySelector('#candidate-template');
const taskTemplate = document.querySelector('#task-card-template');
const sessionTemplate = document.querySelector('#session-template');

document.querySelector('#refresh-providers').addEventListener('click', async () => {
  await loadProviders();
  renderRunConfig();
});
heroOpenCompareButton.addEventListener('click', () => {
  if (state.selectedTaskId) {
    window.location.href = buildCompareUrl(state.selectedTaskId);
  }
});
detailOpenCompareButton.addEventListener('click', () => {
  if (state.selectedTaskId) {
    window.location.href = buildCompareUrl(state.selectedTaskId);
  }
});
taskMarkdownEditTab.addEventListener('click', () => {
  state.editorMode = 'source';
  renderEditorMode();
});
taskMarkdownPreviewTab.addEventListener('click', () => {
  state.editorMode = 'preview';
  renderEditorMode();
});
prepareButton.addEventListener('click', () => runSelectedTask('prepare', { dryRun: true }));
runButton.addEventListener('click', () => runSelectedTask('run', { dryRun: true }));
runLiveButton.addEventListener('click', () => runSelectedTask('run', { dryRun: false }));
openCompareButton.addEventListener('click', () => {
  if (state.selectedTaskId) {
    window.location.href = buildCompareUrl(state.selectedTaskId);
  }
});
openLatestRunButton.addEventListener('click', () => {
  if (state.taskDetail?.run_dir) {
    navigator.clipboard?.writeText(state.taskDetail.run_dir);
    showToast({
      title: 'Run path copied',
      lines: [state.taskDetail.run_dir]
    });
  }
});

taskMarkdown.addEventListener('input', () => {
  const markdown = taskMarkdown.value;
  renderMarkdownPreview();
  if (!markdown) {
    return;
  }
  window.clearTimeout(taskMarkdown._parseTimer);
  taskMarkdown._parseTimer = window.setTimeout(() => parseMarkdownPreview(markdown), 300);
});

async function boot() {
  await Promise.all([loadTasks(), loadProviders()]);
  const requestedTaskId = searchParams.get('task');
  const initialTask = requestedTaskId
    ? state.tasks.find((task) => task.task_id === requestedTaskId)
    : state.tasks[0];
  if (initialTask) {
    await selectTask(initialTask.task_id);
  }
}

async function loadTasks() {
  const response = await fetch('/api/tasks');
  const payload = await response.json();
  state.tasks = payload.tasks;
  const projectIds = new Set(state.tasks.map((task) => task.project_id));
  if (state.projectFilter !== 'all' && !projectIds.has(state.projectFilter)) {
    state.projectFilter = 'all';
  }
  const pageModel = paginateItems(getVisibleTasks(), state.boardPage, state.boardPageSize);
  state.boardPage = pageModel.page;
  renderBoard();
}

async function loadProviders() {
  const response = await fetch('/api/providers');
  state.providers = await response.json();
  renderProviders();
  renderSessions();
}

async function loadLiveSessions(taskId = state.selectedTaskId) {
  if (!taskId) {
    state.liveSessions = [];
    renderSessions();
    return;
  }

  const response = await fetch(`/api/sessions?taskId=${encodeURIComponent(taskId)}&limit=20`);
  const payload = await response.json();
  state.liveSessions = payload.sessions || [];
  renderSessions();
}

async function selectTask(taskId) {
  state.selectedTaskId = taskId;
  syncTaskUrl(taskId);
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`);
  state.taskDetail = await response.json();
  state.runConfig = ensureRunConfigDefaults(deepClone(state.taskDetail.run_config || { providers: [] }));
  state.parsedPreview = state.taskDetail.task;
  state.previewValidation = {
    ok: true,
    errors: [],
    warnings: state.taskDetail.warnings || []
  };
  state.liveSessions = state.taskDetail.current_sessions || [];
  state.detailSection = normalizeDetailSection(state.detailSection);
  taskMarkdown.value = state.taskDetail.markdown;
  renderMarkdownPreview();
  renderDetail();
  renderRunConfig();
  renderSessions();
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

async function runSelectedTask(action, { dryRun }) {
  if (!state.selectedTaskId || !hasEnabledProviders()) {
    return;
  }

  const liveRunWarning = !dryRun ? buildLiveRunWarning() : null;
  if (liveRunWarning?.blocking) {
    showToast({
      title: 'Live run blocked',
      lines: liveRunWarning.lines || [liveRunWarning.message],
      tone: 'warn'
    });
    return;
  }
  if (liveRunWarning?.lines?.length) {
    showToast({
      title: 'Live run proceeding with warnings',
      lines: liveRunWarning.lines,
      tone: 'warn',
      timeoutMs: 9000
    });
  }

  setRunControlsBusy(true, dryRun);
  if (!dryRun) {
    startRunPolling();
  }

  try {
    const response = await fetch(`/api/run/${encodeURIComponent(state.selectedTaskId)}?dryRun=${dryRun ? 'true' : 'false'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        markdown: taskMarkdown.value,
        run_config: state.runConfig,
        dry_run: dryRun
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'run_failed');
    }

    runSummary.textContent = JSON.stringify(payload.summary || payload, null, 2);
  } catch (error) {
    showToast({
      title: 'Run failed',
      lines: [error.message || String(error)],
      tone: 'danger'
    });
  } finally {
    stopRunPolling();
    await Promise.all([loadTasks(), loadProviders(), selectTask(state.selectedTaskId)]);
    setRunControlsBusy(false, dryRun);
  }
}

function renderBoard() {
  board.innerHTML = '';
  const filteredTasks = getVisibleTasks();
  const pageModel = paginateItems(filteredTasks, state.boardPage, state.boardPageSize);
  state.boardPage = pageModel.page;
  renderBoardControls(pageModel);

  const visibleProjects = new Set(filteredTasks.map((task) => task.project_id));
  boardSummary.textContent = [
    `${filteredTasks.length} task card${filteredTasks.length === 1 ? '' : 's'}`,
    `${visibleProjects.size} project${visibleProjects.size === 1 ? '' : 's'}`,
    `grouped by ${state.boardGrouping}`,
    `page ${pageModel.page}/${pageModel.totalPages}`
  ].join(' • ');

  if (filteredTasks.length === 0) {
    const empty = document.createElement('article');
    empty.className = 'info-block';
    const title = document.createElement('h4');
    title.textContent = 'No matching tasks';
    const body = document.createElement('p');
    body.textContent = 'Change the project filter or create more demo cards to populate the board.';
    empty.append(title, body);
    board.appendChild(empty);
    return;
  }

  const groups = groupTasks(pageModel.items);
  for (const group of groups) {
    const section = document.createElement('section');
    section.className = 'board-group';

    if (state.boardGrouping !== 'none') {
      const header = document.createElement('div');
      header.className = 'board-group-header';
      const title = document.createElement('h3');
      title.textContent = group.label;
      const meta = document.createElement('span');
      meta.className = 'hint';
      meta.textContent = `${group.tasks.length} card${group.tasks.length === 1 ? '' : 's'}`;
      header.append(title, meta);
      section.appendChild(header);
    }

    const grid = document.createElement('div');
    grid.className = 'board-grid';
    for (const task of group.tasks) {
      grid.appendChild(renderTaskCard(task));
    }
    section.appendChild(grid);
    board.appendChild(section);
  }
}

function renderBoardControls(pageModel) {
  boardControls.innerHTML = '';

  const projectIds = [...new Map(state.tasks.map((task) => [task.project_id, task.project_label || task.project_id])).entries()]
    .sort((left, right) => left[1].localeCompare(right[1]));

  const projectLabel = document.createElement('label');
  projectLabel.className = 'field-label';
  projectLabel.textContent = 'Project Filter';
  const projectSelect = document.createElement('select');
  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = 'all projects';
  projectSelect.appendChild(allOption);
  for (const [projectId, label] of projectIds) {
    const option = document.createElement('option');
    option.value = projectId;
    option.textContent = label;
    projectSelect.appendChild(option);
  }
  projectSelect.value = state.projectFilter;
  projectSelect.addEventListener('change', () => {
    state.projectFilter = projectSelect.value;
    state.boardPage = 1;
    renderBoard();
  });
  projectLabel.appendChild(projectSelect);

  const groupLabel = document.createElement('label');
  groupLabel.className = 'field-label';
  groupLabel.textContent = 'Group By';
  const groupSelect = document.createElement('select');
  for (const value of ['project', 'state', 'none']) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    groupSelect.appendChild(option);
  }
  groupSelect.value = state.boardGrouping;
  groupSelect.addEventListener('change', () => {
    state.boardGrouping = groupSelect.value;
    state.boardPage = 1;
    renderBoard();
  });
  groupLabel.appendChild(groupSelect);

  const pageSizeLabel = document.createElement('label');
  pageSizeLabel.className = 'field-label';
  pageSizeLabel.textContent = 'Cards Per Page';
  const pageSizeSelect = document.createElement('select');
  for (const value of [4, 6, 8, 12]) {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = String(value);
    pageSizeSelect.appendChild(option);
  }
  pageSizeSelect.value = String(state.boardPageSize);
  pageSizeSelect.addEventListener('change', () => {
    state.boardPageSize = Number.parseInt(pageSizeSelect.value, 10) || 6;
    state.boardPage = 1;
    renderBoard();
  });
  pageSizeLabel.appendChild(pageSizeSelect);

  const pager = document.createElement('div');
  pager.className = 'pager';
  const prevButton = document.createElement('button');
  prevButton.className = 'ghost-button';
  prevButton.textContent = 'Prev';
  prevButton.disabled = pageModel.page <= 1;
  prevButton.addEventListener('click', () => {
    state.boardPage = Math.max(1, state.boardPage - 1);
    renderBoard();
  });
  const pageReadout = document.createElement('span');
  pageReadout.className = 'hint';
  const start = pageModel.totalItems === 0 ? 0 : pageModel.startIndex + 1;
  pageReadout.textContent = `${start}-${pageModel.endIndex} of ${pageModel.totalItems}`;
  const nextButton = document.createElement('button');
  nextButton.className = 'ghost-button';
  nextButton.textContent = 'Next';
  nextButton.disabled = pageModel.page >= pageModel.totalPages;
  nextButton.addEventListener('click', () => {
    state.boardPage = Math.min(pageModel.totalPages, state.boardPage + 1);
    renderBoard();
  });
  pager.append(prevButton, pageReadout, nextButton);

  boardControls.append(projectLabel, groupLabel, pageSizeLabel, pager);
}

function getVisibleTasks() {
  return state.tasks.filter((task) => state.projectFilter === 'all' || task.project_id === state.projectFilter);
}

function groupTasks(tasks) {
  if (state.boardGrouping === 'none') {
    return [{ label: 'All Tasks', tasks }];
  }

  const groups = new Map();
  for (const task of tasks) {
    const key = state.boardGrouping === 'state'
      ? task.state
      : (task.project_label || task.project_id || 'Project');
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(task);
  }

  return [...groups.entries()]
    .map(([label, groupedTasks]) => ({
      label,
      tasks: groupedTasks.sort((left, right) => (right.demo_priority || 0) - (left.demo_priority || 0) || left.title.localeCompare(right.title))
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function renderTaskCard(task) {
  const node = taskTemplate.content.firstElementChild.cloneNode(true);
  const isSelected = task.task_id === state.selectedTaskId;
  node.querySelector('.task-source').textContent = task.source_label || displaySourceSystem(task.source_system);
  node.dataset.taskId = task.task_id;
  node.setAttribute('aria-label', `Focus task ${task.title}`);
  node.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  node.classList.toggle('is-selected', isSelected);

  const stateEl = node.querySelector('.task-state');
  stateEl.textContent = formatStatusBadge(task.state);
  stateEl.className = `task-state ${stateClass(task.state)}`;

  node.querySelector('h3').textContent = task.title;
  node.querySelector('.task-meta').textContent = `${task.repo} • judge ${humanizeProvider(task.judge)}`;
  node.querySelector('.task-project').textContent = task.project_label || task.project_id || 'Project';
  node.querySelector('.task-summary').textContent = task.card_summary || task.objective;
  node.querySelector('.task-eval').textContent = summarizeTaskDecision(task);
  node.querySelector('.task-checks').textContent = [
    task.acceptance_summary || 'No checks',
    task.run_origin_label ? `origin ${task.run_origin_label}` : null
  ].filter(Boolean).join(' • ');
  node.querySelector('.task-providers').textContent = `Candidates: ${(task.provider_labels || task.providers || []).join(', ')}`;
  node.addEventListener('click', () => selectTask(task.task_id));
  node.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectTask(task.task_id);
    }
  });
  return node;
}

function renderProviders() {
  providers.innerHTML = '';
  for (const provider of state.providers?.providers || []) {
    const node = providerTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.provider-name').textContent = provider.display_name;
    node.querySelector('.provider-meta').textContent = provider.installed
      ? [
          `${provider.binary} • ${provider.version || 'version unknown'}`,
          `run ${provider.default_transport}`,
          provider.auth_detail || 'No auth detail available.'
        ].join(' • ')
      : `${provider.binary} missing`;

    const stateEl = node.querySelector('.provider-state');
    const authState = provider.installed ? provider.auth_status : 'not_installed';
    stateEl.textContent = formatStatusBadge(authState, { provider: provider.provider });
    stateEl.className = `provider-state ${stateClass(authState)}`;

    node.querySelector('.provider-test-auth').addEventListener('click', async () => {
      const response = await fetch(`/api/providers/${provider.provider}/open-test`, { method: 'POST' });
      const payload = await response.json();
      const instructions = payload.test.instructions || provider.login_instructions || [];
      const command = payload.launcher?.human_command || (payload.test.command || []).join(' ');
      showToast({
        title: `${provider.display_name} test launched`,
        lines: [
          `Command: ${command}`,
          ...(provider.auth_detail ? [`Current read: ${provider.auth_detail}`] : []),
          ...instructions
        ]
      });
      await Promise.all([loadProviders(), loadLiveSessions()]);
    });

    node.querySelector('.provider-login').addEventListener('click', async () => {
      const response = await fetch(`/api/providers/${provider.provider}/open-login`, { method: 'POST' });
      const payload = await response.json();
      const instructions = payload.login.instructions || provider.login_instructions || [];
      const command = payload.launcher?.human_command || (provider.login_command || []).join(' ');
      showToast({
        title: `${provider.display_name} login opened`,
        lines: [
          `Auth status: ${authState}`,
          `Command: ${command}`,
          ...(provider.auth_detail ? [`Detail: ${provider.auth_detail}`] : []),
          ...instructions
        ]
      });
      await loadProviders();
      if (state.selectedTaskId) {
        await selectTask(state.selectedTaskId);
      }
    });
    providers.appendChild(node);
  }
}

function renderRunConfig() {
  runConfigRoot.innerHTML = '';
  runPolicyRoot.innerHTML = '';
  if (!state.taskDetail || !state.runConfig) {
    runConfigSummary.textContent = 'Select a task to configure providers.';
    setRunButtonsDisabled(true, true, true);
    return;
  }

  const providerMeta = getProviderMetaMap();
  const configs = state.runConfig.providers || [];
  const enabledProviders = configs.filter((provider) => provider.enabled && Number(provider.agents) > 0);
  const enabledAgents = enabledProviders.reduce((sum, provider) => sum + Number(provider.agents || 0), 0);
  const liveRunnableProviders = enabledProviders.filter((config) => isLiveRunnable(providerMeta.get(config.provider)));
  const invalidProviders = enabledProviders.filter((config) => isLiveBlocked(providerMeta.get(config.provider)));
  runConfigSummary.textContent = `${enabledProviders.length} providers enabled • ${enabledAgents} candidate sessions • ${liveRunnableProviders.length} runnable live • ${invalidProviders.length} need login or install • judge ${humanizeProvider(state.runConfig.judge)} • merge ${state.runConfig.merge_mode}`;
  renderRunPolicy();

  for (const config of configs) {
    const provider = providerMeta.get(config.provider) || {};
    const node = runConfigTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.provider-config-name').textContent = provider.display_name || config.provider;
    node.querySelector('.provider-config-meta').textContent = [
      provider.installed ? (provider.version || 'installed') : 'not installed',
      `login ${displayState(provider.auth_status || 'unknown')}`,
      `run ${config.transport}`,
      provider.auth_detail || 'No auth detail available.'
    ].join(' • ');

    const authStateEl = node.querySelector('.provider-config-auth');
    const authState = provider.installed ? (provider.auth_status || 'unknown') : 'not_installed';
    authStateEl.textContent = formatStatusBadge(authState, { provider: provider.provider });
    authStateEl.className = `provider-state ${stateClass(authState)}`;

    const enabledInput = node.querySelector('.provider-enabled');
    enabledInput.checked = Boolean(config.enabled);
    enabledInput.addEventListener('change', () => {
      config.enabled = enabledInput.checked;
      renderRunConfig();
    });

    const agentInput = node.querySelector('.provider-agents');
    agentInput.value = String(config.agents ?? 1);
    agentInput.disabled = !config.enabled;
    agentInput.addEventListener('input', () => {
      const nextValue = Number.parseInt(agentInput.value, 10);
      config.agents = Number.isFinite(nextValue) ? Math.max(0, Math.min(nextValue, 4)) : 0;
      renderRunConfig();
    });

    const profileInput = node.querySelector('.provider-profile');
    profileInput.value = config.profile_id || 'default';
    profileInput.disabled = !config.enabled;
    profileInput.addEventListener('input', () => {
      config.profile_id = profileInput.value.trim() || 'default';
    });

    const transportSelect = node.querySelector('.provider-transport');
    const transports = provider.supported_run_transports || [config.transport || 'pipe'];
    for (const transport of transports) {
      const option = document.createElement('option');
      option.value = transport;
      option.textContent = transport;
      transportSelect.appendChild(option);
    }
    transportSelect.value = config.transport || transports[0] || 'pipe';
    transportSelect.disabled = !config.enabled;
    transportSelect.addEventListener('change', () => {
      config.transport = transportSelect.value;
    });

    runConfigRoot.appendChild(node);
  }

  const disablePreview = !hasEnabledProviders();
  const disableLive = liveRunnableProviders.length === 0;
  setRunButtonsDisabled(disablePreview, disablePreview, disableLive);
}

function renderRunPolicy() {
  const block = document.createElement('article');
  block.className = 'provider-config-row';

  const header = document.createElement('div');
  header.className = 'provider-config-top';
  const title = document.createElement('strong');
  title.textContent = 'Evaluation + Merge';
  const hint = document.createElement('span');
  hint.className = 'provider-state state-warn';
  hint.textContent = `Judge ${humanizeProvider(state.runConfig.judge)}`;
  header.append(title, hint);

  const meta = document.createElement('p');
  meta.className = 'provider-config-meta';
  meta.textContent = 'Choose whether Alloy should stop at scoring, propose a merge, or auto-finalize a clear deterministic winner.';

  const controls = document.createElement('div');
  controls.className = 'provider-config-controls';

  const mergeLabel = document.createElement('label');
  mergeLabel.textContent = 'Merge Mode';
  const mergeSelect = document.createElement('select');
  for (const mode of ['auto', 'hybrid', 'manual']) {
    const option = document.createElement('option');
    option.value = mode;
    option.textContent = mode;
    mergeSelect.appendChild(option);
  }
  mergeSelect.value = state.runConfig.merge_mode || 'hybrid';
  mergeSelect.addEventListener('change', () => {
    state.runConfig.merge_mode = mergeSelect.value;
    renderRunConfig();
    renderDetail();
  });
  mergeLabel.appendChild(mergeSelect);

  const judgeLabel = document.createElement('label');
  judgeLabel.textContent = 'Judge';
  const judgeInput = document.createElement('input');
  judgeInput.type = 'text';
  judgeInput.value = humanizeProvider(state.runConfig.judge);
  judgeInput.disabled = true;
  judgeLabel.appendChild(judgeInput);

  const modeLabel = document.createElement('label');
  modeLabel.textContent = 'Task Mode';
  const modeInput = document.createElement('input');
  modeInput.type = 'text';
  modeInput.value = state.runConfig.mode || state.taskDetail.task.mode || 'race';
  modeInput.disabled = true;
  modeLabel.appendChild(modeInput);

  controls.append(mergeLabel, judgeLabel, modeLabel);
  block.append(header, meta, controls);
  runPolicyRoot.appendChild(block);
}

function renderDetail() {
  if (!state.taskDetail) {
    return;
  }

  const task = state.parsedPreview || state.taskDetail.task;
  const comparisonRows = new Map((state.taskDetail.comparison_view?.rows || []).map((row) => [row.candidate_id, row]));
  const evaluationByCandidateId = new Map((state.taskDetail.evaluation?.candidates || []).map((candidate) => [candidate.candidate_id, candidate]));

  detailTitle.textContent = task.title || state.taskDetail.task.title;
  const detailStatus = state.taskDetail.latest_run_overview?.status_label || 'Draft';
  detailState.textContent = formatStatusBadge(detailStatus);
  detailState.className = `state-pill ${stateClass(detailStatus)}`;

  renderDetailNav();
  renderTaskBrief(task);
  renderEvaluationCall(state.taskDetail.latest_run_overview, state.taskDetail.evaluation);
  renderComparisonView(state.taskDetail.comparison_view);
  applyDetailSectionVisibility();
  renderEditorMode();

  taskJson.textContent = JSON.stringify({
    task,
    validation: state.previewValidation || {},
    run_config: state.runConfig || state.taskDetail.run_config,
    sessions: state.liveSessions,
    merge_view: state.taskDetail.merge_view,
    compare_url: state.taskDetail.compare_url
  }, null, 2);
  runSummary.textContent = JSON.stringify(state.taskDetail.latest_run || { message: 'No run yet.' }, null, 2);

  candidateCards.innerHTML = '';
  for (const candidate of state.taskDetail.candidates || []) {
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
    inspectButton.addEventListener('click', async () => {
      window.location.href = buildCompareUrl(state.selectedTaskId, candidate.candidate_id);
    });
    node.appendChild(inspectButton);
    candidateCards.appendChild(node);
  }

  openCompareButton.disabled = !state.selectedTaskId;
  heroOpenCompareButton.disabled = !state.selectedTaskId;
  detailOpenCompareButton.disabled = !state.selectedTaskId;
  heroOpenDocsLink.href = buildDocsUrl(state.selectedTaskId);
  openLatestRunButton.disabled = !state.taskDetail.run_dir;
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

  appendInfoBlock(taskBrief, 'Project', task.project_label ? `${task.project_label} (${task.project_id})` : (task.project_id || 'No project metadata.'));
  appendInfoBlock(taskBrief, 'Objective', task.context || task.title || 'No task title available.');
  appendListBlock(taskBrief, 'Requirements', task.requirements || [], 'No explicit requirements.');
  appendListBlock(taskBrief, 'Constraints', task.constraints || [], 'No explicit constraints.');
  appendListBlock(taskBrief, 'Acceptance Checks', task.acceptance_checks || [], 'No acceptance checks declared.');
  appendListBlock(taskBrief, 'Operator Notes', task.human_notes || [], 'No operator notes.');

  const routing = document.createElement('div');
  routing.className = 'info-block';
  const title = document.createElement('h4');
  title.textContent = 'Routing';
  const value = document.createElement('p');
  value.textContent = [
    `Mode ${task.mode || 'unknown'}`,
    `Judge ${humanizeProvider(task.judge)}`,
    `Review ${task.human_review_policy || 'standard'}`,
    `Publish ${task.publish_policy || 'manual'}`
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
}

function renderEvaluationCall(overview, evaluation) {
  evaluationCall.innerHTML = '';

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

  appendInfoBlock(
    comparisonView,
    'Decision',
    comparison.decision?.summary || 'No evaluator decision is available yet.'
  );
  appendInfoBlock(
    comparisonView,
    'Synthesis Guidance',
    comparison.decision?.synthesis_summary || 'Synthesis guidance is not available yet.'
  );

  if (comparison.merge_plan) {
    appendInfoBlock(
      comparisonView,
      'Merge Plan',
      [
        comparison.merge_plan.base_candidate_label ? `base ${comparison.merge_plan.base_candidate_label}` : null,
        comparison.merge_plan.mode,
        `confidence ${comparison.merge_plan.confidence}`,
        comparison.merge_plan.unresolved_conflicts?.length
          ? `${comparison.merge_plan.unresolved_conflicts.length} contested file${comparison.merge_plan.unresolved_conflicts.length === 1 ? '' : 's'}`
          : 'no unresolved conflicts'
      ].filter(Boolean).join(' • ')
    );
    appendInfoBlock(
      comparisonView,
      'Plan Rationale',
      comparison.merge_plan.rationale
    );
  }

  const contributionEntries = Object.entries(comparison.contribution_map || {})
    .filter(([, label]) => label)
    .map(([key, label]) => `${humanizeContributionKey(key)}: ${label}`);
  appendListBlock(comparisonView, 'Contribution Map', contributionEntries, 'No contribution map yet.');

  const compareButtonBlock = document.createElement('div');
  compareButtonBlock.className = 'info-block';
  const compareButtonTitle = document.createElement('h4');
  compareButtonTitle.textContent = 'Dedicated Compare Workspace';
  const compareButtonBody = document.createElement('p');
  compareButtonBody.textContent = 'Open the full compare page for candidate patches, synthesized diffs, per-file provenance, and finalization controls.';
  const compareButton = document.createElement('button');
  compareButton.className = 'ghost-button';
  compareButton.textContent = 'Open Compare Workspace';
  compareButton.textContent = 'Open Compare Diffs';
  compareButton.addEventListener('click', () => {
    window.location.href = buildCompareUrl(state.selectedTaskId);
  });
  compareButtonBlock.append(compareButtonTitle, compareButtonBody, compareButton);
  comparisonView.appendChild(compareButtonBlock);

  if ((comparison.rows || []).length === 0) {
    appendInfoBlock(comparisonView, 'Candidates', 'No candidate artifacts are available yet.');
    return;
  }

  const list = document.createElement('div');
  list.className = 'comparison-list';
  for (const row of comparison.rows) {
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

    const files = document.createElement('p');
    files.className = 'comparison-files';
    files.textContent = row.changed_files.length
      ? `Files: ${row.changed_files.join(', ')}`
      : 'Files: no captured diff yet.';

    const summary = document.createElement('p');
    summary.className = 'comparison-summary';
    summary.textContent = row.summary;

    const actions = document.createElement('div');
    actions.className = 'task-chip-row';
    const diffButton = document.createElement('button');
    diffButton.className = 'ghost-button';
    diffButton.textContent = 'Open Compare';
    diffButton.addEventListener('click', async () => {
      window.location.href = buildCompareUrl(state.selectedTaskId, row.candidate_id);
    });
    actions.appendChild(diffButton);

    article.append(header, meta, files, summary, actions);
    list.appendChild(article);
  }
  comparisonView.appendChild(list);
}

function renderSessions() {
  sessionList.innerHTML = '';
  const sessions = mergeSessions(
    state.liveSessions,
    state.taskDetail?.current_sessions || [],
    state.taskDetail?.sessions || [],
    (state.providers?.recent_sessions || []).filter((session) => !state.selectedTaskId || session.task_id === state.selectedTaskId)
  );

  if (sessions.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'No sessions recorded for the selected task yet.';
    sessionList.appendChild(empty);
    return;
  }

  for (const session of sessions.slice(0, 6)) {
    const node = sessionTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.session-label').textContent = `${humanizeProvider(session.provider)} • ${session.kind}`;
    const statusEl = node.querySelector('.session-status');
    statusEl.textContent = formatStatusBadge(session.status);
    statusEl.className = `candidate-status ${stateClass(session.status)}`;
    node.querySelector('.session-meta').textContent = [
      session.transport,
      session.profile_id || 'default',
      session.started_at || 'not started',
      session.error || 'no error'
    ].join(' • ');
    sessionList.appendChild(node);
  }
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

function buildCompareUrl(taskId, candidateId = null) {
  const params = new URLSearchParams({ task: taskId });
  if (candidateId) {
    params.set('candidate', candidateId);
  }
  return `/compare.html?${params.toString()}`;
}

function buildDocsUrl(taskId = null) {
  const params = new URLSearchParams({ doc: 'operator-guide' });
  if (taskId) {
    params.set('task', taskId);
  }
  return `/docs.html?${params.toString()}`;
}

function syncTaskUrl(taskId) {
  const next = new URL(window.location.href);
  next.searchParams.set('task', taskId);
  window.history.replaceState({}, '', next);
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

function setRunControlsBusy(isBusy, dryRun) {
  state.runInFlight = isBusy;
  prepareButton.disabled = isBusy || !hasEnabledProviders();
  runButton.disabled = isBusy || !hasEnabledProviders();
  runLiveButton.disabled = isBusy || !hasLiveRunnableProviders();

  prepareButton.textContent = isBusy ? 'Preparing…' : 'Prepare Run';
  runButton.textContent = isBusy && dryRun ? 'Previewing…' : 'Preview Commands';
  runLiveButton.textContent = isBusy && !dryRun ? 'Running…' : 'Run Live';
}

function setRunButtonsDisabled(disablePrepare, disablePreview, disableLive) {
  if (!state.runInFlight) {
    prepareButton.disabled = disablePrepare;
    runButton.disabled = disablePreview;
    runLiveButton.disabled = disableLive;
  }
}

function startRunPolling() {
  stopRunPolling();
  state.runPollTimer = window.setInterval(async () => {
    await Promise.all([loadProviders(), loadLiveSessions()]);
  }, 1500);
}

function stopRunPolling() {
  if (state.runPollTimer) {
    window.clearInterval(state.runPollTimer);
    state.runPollTimer = null;
  }
}

function hasEnabledProviders() {
  return (state.runConfig?.providers || []).some((provider) => provider.enabled && Number(provider.agents) > 0);
}

function hasLiveRunnableProviders() {
  const providerMeta = getProviderMetaMap();
  return (state.runConfig?.providers || []).some((config) => (
    config.enabled
    && Number(config.agents) > 0
    && isLiveRunnable(providerMeta.get(config.provider))
  ));
}

function buildLiveRunWarning() {
  const providerMeta = getProviderMetaMap();
  const enabled = (state.runConfig?.providers || []).filter((config) => config.enabled && Number(config.agents) > 0);
  const runnable = enabled.filter((config) => isLiveRunnable(providerMeta.get(config.provider)));
  const blocked = enabled.filter((config) => isLiveBlocked(providerMeta.get(config.provider)));
  const manualCheck = enabled.filter((config) => {
    const provider = providerMeta.get(config.provider);
    return provider?.installed && provider.auth_status === 'manual_check';
  });

  if (runnable.length === 0) {
    return {
      blocking: true,
      lines: ['No enabled provider is currently runnable live. Disable providers that are not installed or not logged in, then retry.']
    };
  }

  const warnings = [];
  if (blocked.length > 0) {
    warnings.push(`These enabled providers are not ready and are likely to fail: ${blocked.map((config) => humanizeProvider(config.provider)).join(', ')}.`);
  }
  if (manualCheck.length > 0) {
    warnings.push(`These enabled providers require manual login verification in the CLI session: ${manualCheck.map((config) => humanizeProvider(config.provider)).join(', ')}.`);
  }
  warnings.push(`Proceeding with a live run for ${runnable.map((config) => humanizeProvider(config.provider)).join(', ')}.`);

  return warnings.length > 1
    ? { blocking: false, lines: warnings }
    : null;
}

function getProviderMetaMap() {
  return new Map((state.providers?.providers || []).map((provider) => [provider.provider, provider]));
}

function isLiveRunnable(provider) {
  return Boolean(provider?.installed) && provider.auth_status !== 'invalid' && provider.auth_status !== 'not_installed';
}

function isLiveBlocked(provider) {
  return !provider?.installed || provider.auth_status === 'invalid' || provider.auth_status === 'not_installed';
}

function mergeSessions(...sessionLists) {
  const merged = new Map();
  for (const list of sessionLists) {
    for (const session of list || []) {
      if (!session?.session_id) {
        continue;
      }
      merged.set(session.session_id, session);
    }
  }
  return [...merged.values()].sort((left, right) => String(right.started_at || '').localeCompare(String(left.started_at || '')));
}

function summarizeTaskDecision(task) {
  if (task.run_origin === 'fixture_replay') {
    return 'Fixture replay only';
  }
  if (task.run_origin === 'legacy_artifact') {
    return 'Legacy artifact';
  }
  if (task.run_origin === 'preview') {
    return 'Command preview only';
  }
  if (task.latest_run?.synthesis?.status === 'completed') {
    return `Synthesized ${task.latest_run.synthesis.strategy}`;
  }
  if (task.latest_run?.evaluation?.decision?.winner?.label) {
    return `Winner ${task.latest_run.evaluation.decision.winner.label}`;
  }
  if (task.latest_run?.evaluation?.decision?.mode === 'synthesize') {
    return 'Synthesis recommended';
  }
  if (task.latest_run?.status === 'dry-run') {
    return 'Dry run only';
  }
  return task.state;
}

function humanizeProvider(provider) {
  switch (provider) {
    case 'claude-code':
      return 'Claude Code';
    case 'gemini':
      return 'Gemini CLI';
    case 'codex':
      return 'Codex';
    default:
      return provider || 'unknown';
  }
}

function humanizeContributionKey(key) {
  switch (key) {
    case 'top_score':
      return 'Top score';
    case 'smallest_patch':
      return 'Smallest patch';
    case 'narrowest_scope':
      return 'Narrowest scope';
    case 'best_path_discipline':
      return 'Best path discipline';
    default:
      return key.replace(/_/g, ' ');
  }
}

function shortId(value) {
  return value ? value.slice(0, 12) : '';
}

function displaySourceSystem(value) {
  switch (value) {
    case 'symphony':
      return 'Imported card';
    case 'manual':
      return 'Manual task';
    default:
      return String(value || 'task');
  }
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
  if (normalized.includes('fail') || normalized.includes('invalid') || normalized.includes('not installed') || normalized.includes('not_installed') || normalized.includes('no winner')) {
    return `✕ ${label}`;
  }
  if (normalized.includes('ready') || normalized.includes('pass') || normalized.includes('valid') || normalized.includes('published') || normalized.includes('verified') || normalized.includes('synthesized')) {
    return `✓ ${label}`;
  }
  if (normalized.includes('previewed') || normalized.includes('merge')) {
    return `• ${label}`;
  }
  return `• ${label}`;
}

function ensureRunConfigDefaults(runConfig) {
  return {
    ...runConfig,
    merge_mode: runConfig?.merge_mode || 'hybrid',
    providers: Array.isArray(runConfig?.providers) ? runConfig.providers : []
  };
}

function pickDefaultDiffCandidateId(detail, currentCandidateId) {
  const candidateIds = new Set((detail?.candidates || []).map((candidate) => candidate.candidate_id));
  if (currentCandidateId && candidateIds.has(currentCandidateId)) {
    return currentCandidateId;
  }
  return detail?.merge_view?.winner_candidate_id
    || detail?.comparison_view?.rows?.[0]?.candidate_id
    || detail?.candidates?.[0]?.candidate_id
    || null;
}

function buildInitialMergeSelections(mergeViewData, existingSelections = {}) {
  const next = {};
  const winnerCandidateId = mergeViewData?.winner_candidate_id || null;
  for (const file of mergeViewData?.files || []) {
    const previous = existingSelections[file.path];
    const validOwnerIds = new Set(file.owners.map((owner) => owner.candidate_id));
    if (previous && validOwnerIds.has(previous)) {
      next[file.path] = previous;
      continue;
    }
    if (winnerCandidateId && validOwnerIds.has(winnerCandidateId)) {
      next[file.path] = winnerCandidateId;
      continue;
    }
    next[file.path] = file.owners[0]?.candidate_id || null;
  }
  return next;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stateClass(value) {
  const normalized = String(value).toLowerCase();
  if (normalized.includes('fail') || normalized.includes('invalid') || normalized.includes('not_installed') || normalized.includes('no winner')) {
    return 'state-danger';
  }
  if (normalized.includes('ready') || normalized.includes('pass') || normalized.includes('valid') || normalized.includes('published') || normalized.includes('verified') || normalized.includes('synthesized')) {
    return 'state-success';
  }
  if (normalized.includes('unknown') || normalized.includes('manual') || normalized.includes('prepared') || normalized.includes('previewed') || normalized.includes('running') || normalized.includes('judging') || normalized.includes('external') || normalized.includes('synthesis') || normalized.includes('pending') || normalized.includes('merge')) {
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
  if (!toastStack) {
    return;
  }

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

boot();
