const state = {
  tasks: [],
  selectedTaskId: null,
  taskDetail: null,
  providers: null,
  runConfig: null
};

const board = document.querySelector('#task-board');
const providers = document.querySelector('#providers');
const runConfigRoot = document.querySelector('#run-config');
const runConfigSummary = document.querySelector('#run-config-summary');
const sessionList = document.querySelector('#session-list');
const boardSummary = document.querySelector('#board-summary');
const detailTitle = document.querySelector('#detail-title');
const detailState = document.querySelector('#detail-state');
const taskMarkdown = document.querySelector('#task-markdown');
const taskJson = document.querySelector('#task-json');
const runSummary = document.querySelector('#run-summary');
const candidateCards = document.querySelector('#candidate-cards');
const prepareButton = document.querySelector('#prepare-task');
const runButton = document.querySelector('#run-task');
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
prepareButton.addEventListener('click', () => runSelectedTask('prepare'));
runButton.addEventListener('click', () => runSelectedTask('run'));
openLatestRunButton.addEventListener('click', () => {
  if (state.taskDetail?.run_dir) {
    navigator.clipboard?.writeText(state.taskDetail.run_dir);
    window.alert(`Latest run directory copied:\n${state.taskDetail.run_dir}`);
  }
});

taskMarkdown.addEventListener('input', () => {
  const markdown = taskMarkdown.value;
  if (!markdown) {
    return;
  }
  window.clearTimeout(taskMarkdown._parseTimer);
  taskMarkdown._parseTimer = window.setTimeout(() => parseMarkdownPreview(markdown), 300);
});

async function boot() {
  await Promise.all([loadTasks(), loadProviders()]);
  if (state.tasks[0]) {
    await selectTask(state.tasks[0].task_id);
  }
}

async function loadTasks() {
  const response = await fetch('/api/tasks');
  const payload = await response.json();
  state.tasks = payload.tasks;
  renderBoard();
}

async function loadProviders() {
  const response = await fetch('/api/providers');
  state.providers = await response.json();
  renderProviders();
  renderSessions();
}

async function selectTask(taskId) {
  state.selectedTaskId = taskId;
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`);
  state.taskDetail = await response.json();
  state.runConfig = deepClone(state.taskDetail.run_config || { providers: [] });
  taskMarkdown.value = state.taskDetail.markdown;
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
  taskJson.textContent = JSON.stringify({
    task: payload.source_task || {},
    validation: payload.validation || {},
    run_config: state.runConfig || {}
  }, null, 2);
}

async function runSelectedTask(action) {
  if (!state.selectedTaskId || !hasEnabledProviders()) {
    return;
  }

  prepareButton.disabled = true;
  runButton.disabled = true;

  const response = await fetch(`/api/run/${encodeURIComponent(state.selectedTaskId)}?dryRun=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      markdown: taskMarkdown.value,
      run_config: state.runConfig
    })
  });
  const payload = await response.json();
  runSummary.textContent = JSON.stringify(payload.summary || payload, null, 2);
  await Promise.all([loadTasks(), loadProviders(), selectTask(state.selectedTaskId)]);
  prepareButton.disabled = false;
  runButton.disabled = false;
}

function renderBoard() {
  board.innerHTML = '';
  boardSummary.textContent = `${state.tasks.length} task card${state.tasks.length === 1 ? '' : 's'}`;

  for (const task of state.tasks) {
    const node = taskTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.task-source').textContent = task.source_system;
    const stateEl = node.querySelector('.task-state');
    stateEl.textContent = task.state;
    stateEl.className = `task-state ${stateClass(task.state)}`;
    node.querySelector('h3').textContent = task.title;
    node.querySelector('.task-meta').textContent = `${task.repo} • judge ${task.judge}`;
    node.querySelector('.task-providers').textContent = `Providers: ${task.providers.join(', ')}`;
    node.querySelector('.open-card').addEventListener('click', () => selectTask(task.task_id));
    board.appendChild(node);
  }
}

function renderProviders() {
  providers.innerHTML = '';
  for (const provider of state.providers?.providers || []) {
    const node = providerTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.provider-name').textContent = provider.display_name;
    node.querySelector('.provider-meta').textContent = provider.installed
      ? `${provider.binary} • ${provider.version || 'version unknown'} • run ${provider.default_transport}`
      : `${provider.binary} missing`;
    const stateEl = node.querySelector('.provider-state');
    const authState = provider.installed ? provider.auth_status : 'not_installed';
    stateEl.textContent = authState;
    stateEl.className = `provider-state ${stateClass(authState)}`;
    node.querySelector('.provider-login').addEventListener('click', async () => {
      const response = await fetch(`/api/providers/${provider.provider}/open-login`, { method: 'POST' });
      const payload = await response.json();
      const instructions = payload.login.instructions || provider.login_instructions || [];
      const command = payload.launcher?.human_command || (provider.login_command || []).join(' ');
      window.alert([
        `Provider: ${provider.display_name}`,
        `Auth status: ${authState}`,
        `Command: ${command}`,
        '',
        ...instructions
      ].join('\n'));
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
  if (!state.taskDetail || !state.runConfig) {
    runConfigSummary.textContent = 'Select a task to configure providers.';
    prepareButton.disabled = true;
    runButton.disabled = true;
    return;
  }

  const providerMeta = new Map((state.providers?.providers || []).map((provider) => [provider.provider, provider]));
  const configs = state.runConfig.providers || [];
  const enabledProviders = configs.filter((provider) => provider.enabled && Number(provider.agents) > 0);
  const enabledAgents = enabledProviders.reduce((sum, provider) => sum + Number(provider.agents || 0), 0);
  runConfigSummary.textContent = `${enabledProviders.length} providers enabled • ${enabledAgents} candidate sessions • judge ${state.runConfig.judge}`;

  for (const config of configs) {
    const provider = providerMeta.get(config.provider) || {};
    const node = runConfigTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.provider-config-name').textContent = provider.display_name || config.provider;
    node.querySelector('.provider-config-meta').textContent = [
      provider.installed ? (provider.version || 'installed') : 'not installed',
      `login ${provider.auth_status || 'unknown'}`,
      `run ${config.transport}`
    ].join(' • ');

    const authStateEl = node.querySelector('.provider-config-auth');
    const authState = provider.installed ? (provider.auth_status || 'unknown') : 'not_installed';
    authStateEl.textContent = authState;
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

  const disableRunButtons = !hasEnabledProviders();
  prepareButton.disabled = disableRunButtons;
  runButton.disabled = disableRunButtons;
}

function renderDetail() {
  if (!state.taskDetail) {
    return;
  }

  const evaluationByCandidateId = new Map((state.taskDetail.evaluation?.candidates || []).map((candidate) => [candidate.candidate_id, candidate]));
  detailTitle.textContent = state.taskDetail.task.title;
  detailState.textContent = state.taskDetail.latest_run ? mapRunState(state.taskDetail.latest_run.status) : 'Draft';
  detailState.className = `state-pill ${stateClass(detailState.textContent)}`;
  taskJson.textContent = JSON.stringify({
    task: state.taskDetail.task,
    run_config: state.runConfig || state.taskDetail.run_config,
    sessions: state.taskDetail.sessions || []
  }, null, 2);
  runSummary.textContent = JSON.stringify(state.taskDetail.latest_run || { message: 'No run yet.' }, null, 2);
  candidateCards.innerHTML = '';
  for (const candidate of state.taskDetail.candidates || []) {
    const node = candidateTemplate.content.firstElementChild.cloneNode(true);
    const instanceId = candidate.provider_instance_id ? ` • ${candidate.provider_instance_id}` : '';
    node.querySelector('.candidate-label').textContent = `${candidate.candidate_slot} • ${candidate.provider}${instanceId}`;
    const status = candidate.verification?.status === 'pass'
      ? `${candidate.status} / verified`
      : candidate.verification?.status === 'fail'
        ? `${candidate.status} / verification failed`
        : candidate.status;
    const evaluation = evaluationByCandidateId.get(candidate.candidate_id);
    node.querySelector('.candidate-status').textContent = status;
    node.querySelector('.candidate-status').className = `candidate-status ${stateClass(status)}`;
    node.querySelector('.candidate-summary').textContent = evaluation
      ? `${candidate.summary || 'No summary yet.'} Score ${evaluation.scorecard.total}/100.`
      : (candidate.summary || 'No summary yet.');
    node.querySelector('.candidate-verification').textContent = candidate.verification
      ? candidate.verification.checks.map((check) => `${check.status.toUpperCase()}: ${check.command}`).join(' | ')
      : 'Verification not run yet.';
    candidateCards.appendChild(node);
  }
  openLatestRunButton.disabled = !state.taskDetail.run_dir;
}

function renderSessions() {
  sessionList.innerHTML = '';
  const taskSessions = state.taskDetail?.sessions || [];
  const sessions = taskSessions.length > 0
    ? taskSessions
    : (state.providers?.recent_sessions || []).filter((session) => !state.selectedTaskId || session.task_id === state.selectedTaskId);

  if (sessions.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'No sessions recorded for the selected task yet.';
    sessionList.appendChild(empty);
    return;
  }

  for (const session of sessions.slice(0, 6)) {
    const node = sessionTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.session-label').textContent = `${session.provider} • ${session.kind}`;
    const statusEl = node.querySelector('.session-status');
    statusEl.textContent = session.status;
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

function hasEnabledProviders() {
  return (state.runConfig?.providers || []).some((provider) => provider.enabled && Number(provider.agents) > 0);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stateClass(value) {
  const normalized = String(value).toLowerCase();
  if (normalized.includes('ready') || normalized.includes('pass') || normalized.includes('valid') || normalized.includes('published') || normalized.includes('completed')) {
    return 'state-success';
  }
  if (normalized.includes('unknown') || normalized.includes('prepared') || normalized.includes('running') || normalized.includes('judging') || normalized.includes('external')) {
    return 'state-warn';
  }
  if (normalized.includes('fail') || normalized.includes('invalid') || normalized.includes('not_installed')) {
    return 'state-danger';
  }
  return 'state-idle';
}

function mapRunState(status) {
  if (status === 'completed') {
    return 'PR Ready';
  }
  if (status === 'dry-run') {
    return 'Prepared';
  }
  if (status === 'completed_with_failures') {
    return 'Failed';
  }
  return 'Draft';
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

boot();
