const PROVIDER_ORDER = ['codex', 'gemini', 'claude-code'];

export const TASK_TEMPLATE_PRESETS = [
  {
    id: 'existing_repo_bugfix',
    label: 'Existing Repo Bugfix',
    description: 'Repair a bug in an existing repository and prove the fix with concrete acceptance checks.',
    draft: {
      project_id: 'custom-bugfix',
      project_label: 'Custom Bugfix',
      repo: 'workspace/existing-repo',
      mode: 'race',
      judge: 'claude-code',
      risk_level: 'medium',
      human_review_policy: 'standard',
      publish_policy: 'manual',
      synthesis_policy: 'auto',
      bootstrap_style: 'existing_repo',
      init_command: '/init',
      context: 'Fix the target bug in the existing repository without widening scope.',
      requirements: [
        'Preserve current public interfaces unless the task explicitly allows changes.',
        'Add or update focused tests that prove the bug is fixed.'
      ],
      constraints: [
        'Keep the patch reviewable and localized.',
        'Avoid introducing new dependencies unless they are clearly justified.'
      ],
      acceptance_checks: [
        'npm test'
      ],
      optional_guidance: [
        'Summarize the root cause before making changes.'
      ],
      human_notes: [
        'Call out any risky files or migrations before asking for approval.'
      ]
    }
  },
  {
    id: 'existing_repo_feature',
    label: 'Existing Repo Feature',
    description: 'Add a focused feature to an existing codebase with tests and low-risk integration.',
    draft: {
      project_id: 'custom-feature',
      project_label: 'Custom Feature',
      repo: 'workspace/existing-repo',
      mode: 'committee',
      judge: 'claude-code',
      risk_level: 'medium',
      human_review_policy: 'standard',
      publish_policy: 'manual',
      synthesis_policy: 'auto',
      bootstrap_style: 'existing_repo',
      init_command: '/init',
      context: 'Implement the requested feature in the existing repository while keeping the change set reviewable.',
      requirements: [
        'Preserve compatibility with the current main branch.',
        'Update tests and documentation where the new behavior changes user-facing flow.'
      ],
      constraints: [
        'Prefer small, composable changes over broad rewrites.',
        'Keep new abstractions proportional to the task.'
      ],
      acceptance_checks: [
        'npm test'
      ],
      optional_guidance: [
        'Keep the final diff easy to split into implementation and tests if possible.'
      ],
      human_notes: [
        'Review contested files carefully before approving synthesis.'
      ]
    }
  },
  {
    id: 'greenfield_init',
    label: 'New Project',
    description: 'Bootstrap a new project or demo in a clean workspace before implementing behavior.',
    draft: {
      project_id: 'greenfield-lab',
      project_label: 'Greenfield Project',
      repo: 'workspace/new-project',
      mode: 'fast',
      judge: 'none',
      risk_level: 'low',
      human_review_policy: 'minimal',
      publish_policy: 'manual',
      synthesis_policy: 'manual',
      bootstrap_style: 'greenfield',
      init_command: '/init',
      context: 'Create a new project in an empty workspace and implement the requested behavior from scratch.',
      requirements: [
        'Create only the files needed to satisfy the task.',
        'Document any generated project structure or entrypoints.'
      ],
      constraints: [
        'Keep the initial scaffold minimal.',
        'Prefer standard tooling already available in the environment.'
      ],
      acceptance_checks: [
        'npm test'
      ],
      optional_guidance: [
        'Keep setup deterministic so another agent can reproduce the scaffold later.'
      ],
      human_notes: [
        'Review generated project structure before publication.'
      ]
    }
  },
  {
    id: 'security_repair',
    label: 'Security Repair',
    description: 'Fix a vulnerability, document the issue, and verify the mitigation with explicit checks.',
    draft: {
      project_id: 'security-lab',
      project_label: 'Security Repair',
      repo: 'workspace/security-repo',
      mode: 'race',
      judge: 'claude-code',
      risk_level: 'high',
      human_review_policy: 'strict',
      publish_policy: 'manual',
      synthesis_policy: 'auto',
      bootstrap_style: 'existing_repo',
      init_command: '/init',
      context: 'Document the vulnerability, fix the root cause, and add or update checks that prove the issue is closed.',
      requirements: [
        'Explain the vulnerability in human-readable terms.',
        'Fix the root cause instead of only adding a superficial guard.',
        'Add or update tests that fail before the fix and pass after it.'
      ],
      constraints: [
        'Do not weaken existing security controls.',
        'Call out any backward-compatibility risk or data migration concern.'
      ],
      acceptance_checks: [
        'npm test'
      ],
      optional_guidance: [
        'Prefer parameterized or bounded interfaces over string interpolation or unchecked memory access.'
      ],
      human_notes: [
        'Human review should inspect the exploit path and the final mitigation.'
      ]
    }
  }
];

export function createEmptyTaskDraft(overrides = {}) {
  return {
    title: '',
    task_id: '',
    project_id: 'custom-lab',
    project_label: 'Custom Lab',
    repo: 'demo/custom-task',
    repo_path: '',
    base_ref: 'main',
    mode: 'race',
    judge: 'claude-code',
    risk_level: 'medium',
    human_review_policy: 'standard',
    publish_policy: 'manual',
    synthesis_policy: 'auto',
    max_runtime_minutes: 15,
    source_system: 'manual',
    task_template: 'existing_repo_bugfix',
    bootstrap_style: 'existing_repo',
    init_command: '/init',
    providers: [...PROVIDER_ORDER],
    context: '',
    requirements: [],
    constraints: [],
    acceptance_checks: [],
    optional_guidance: [],
    human_notes: [],
    ...overrides
  };
}

export function buildDraftFromTask(task = {}) {
  return createEmptyTaskDraft({
    title: task.title || '',
    task_id: task.task_id || '',
    project_id: task.project_id || 'custom-lab',
    project_label: task.project_label || task.project_id || 'Custom Lab',
    repo: task.repo || 'demo/custom-task',
    repo_path: task.repo_path || '',
    base_ref: task.base_ref || 'main',
    mode: task.mode || 'race',
    judge: task.judge || 'claude-code',
    risk_level: task.risk_level || 'medium',
    human_review_policy: task.human_review_policy || 'standard',
    publish_policy: task.publish_policy || 'manual',
    synthesis_policy: task.synthesis_policy || 'auto',
    max_runtime_minutes: Number.parseInt(task.max_runtime_minutes || 15, 10) || 15,
    source_system: task.source_system || 'manual',
    task_template: task.task_template || 'custom',
    bootstrap_style: task.bootstrap_style || inferBootstrapStyle(task),
    init_command: task.init_command || '/init',
    providers: Array.isArray(task.providers) && task.providers.length > 0
      ? task.providers.filter((provider) => PROVIDER_ORDER.includes(provider))
      : [...PROVIDER_ORDER],
    context: task.context || '',
    requirements: normalizeList(task.requirements || []),
    constraints: normalizeList(task.constraints || []),
    acceptance_checks: normalizeList(task.acceptance_checks || []),
    optional_guidance: normalizeList(task.optional_guidance || []),
    human_notes: normalizeList(task.human_notes || [])
  });
}

export function parseMultilineList(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/^-\s+/, '').trim())
    .filter(Boolean);
}

export function formatMultilineList(values) {
  return normalizeList(values).join('\n');
}

export function getTaskTemplatePreset(presetId) {
  return TASK_TEMPLATE_PRESETS.find((preset) => preset.id === presetId) || null;
}

export function buildTaskTemplateDraft(presetId, overrides = {}) {
  const preset = getTaskTemplatePreset(presetId);
  const filteredOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined)
  );
  if (!preset) {
    return createEmptyTaskDraft(filteredOverrides);
  }
  return createEmptyTaskDraft({
    task_template: preset.id,
    ...preset.draft,
    ...filteredOverrides
  });
}

export function validateTaskDraft(draft) {
  const errors = [];
  const warnings = [];
  const normalized = normalizeDraft(draft);

  for (const field of ['title', 'project_id', 'project_label', 'repo', 'base_ref']) {
    if (!normalized[field]) {
      errors.push(`${field} is required.`);
    }
  }

  if (!normalized.providers.length) {
    errors.push('At least one provider must be enabled.');
  }

  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(normalized.project_id)) {
    warnings.push('project_id should use a simple slug like bugfix-lab.');
  }

  if (!normalized.task_id) {
    warnings.push('task_id will be generated from the title when you write the fields to markdown.');
  }

  if (!normalized.acceptance_checks.length) {
    warnings.push('Add at least one acceptance check before running provider sessions.');
  }

  if (!normalized.repo_path && normalized.bootstrap_style !== 'greenfield') {
    warnings.push('repo_path should point at the existing project folder for non-greenfield tasks.');
  }

  if (!normalized.init_command) {
    warnings.push('init_command is empty. Add a provider-native bootstrap hint or leave the default /init guidance.');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized
  };
}

export function buildTaskMarkdownFromDraft(draft, options = {}) {
  const now = options.now || new Date();
  const normalized = normalizeDraft(draft, now);
  const validation = validateTaskDraft(normalized);
  if (!validation.ok) {
    const message = validation.errors.join(' | ') || 'Task draft is invalid.';
    const error = new Error(message);
    error.validation = validation;
    throw error;
  }

  const frontmatter = [
    `task_id: ${normalized.task_id}`,
    `project_id: ${normalized.project_id}`,
    `project_label: ${quoteIfNeeded(normalized.project_label)}`,
    `source_system: ${normalized.source_system}`,
    `repo: ${quoteIfNeeded(normalized.repo)}`,
    normalized.repo_path ? `repo_path: ${quoteIfNeeded(normalized.repo_path)}` : null,
    `base_ref: ${normalized.base_ref}`,
    `mode: ${normalized.mode}`,
    'providers:',
    ...normalized.providers.map((provider) => `  - ${provider}`),
    `judge: ${normalized.judge}`,
    `max_runtime_minutes: ${normalized.max_runtime_minutes}`,
    `risk_level: ${normalized.risk_level}`,
    `human_review_policy: ${normalized.human_review_policy}`,
    `publish_policy: ${normalized.publish_policy}`,
    `synthesis_policy: ${normalized.synthesis_policy}`,
    `title: ${quoteIfNeeded(normalized.title)}`
  ].filter(Boolean).join('\n');

  const sections = [
    '# Task',
    normalized.title,
    '',
    '## Context',
    normalized.context || '',
    '',
    '## Requirements',
    ...formatBulletSection(normalized.requirements),
    '',
    '## Constraints',
    ...formatBulletSection(normalized.constraints),
    '',
    '## Acceptance Checks',
    ...formatBulletSection(normalized.acceptance_checks),
    '',
    '## Optional Guidance',
    ...formatBulletSection(buildOptionalGuidance(normalized)),
    '',
    '## Human Notes',
    ...formatBulletSection(normalized.human_notes)
  ].join('\n').replace(/\n{3,}/g, '\n\n');

  return `---\n${frontmatter}\n---\n\n${sections}\n`;
}

export function suggestTaskId(title, projectId = 'task', now = new Date()) {
  const datePrefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const slug = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72);
  const prefix = String(projectId || 'task')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `task_${datePrefix}_${slug || prefix || 'custom_task'}`;
}

function normalizeDraft(draft = {}, now = new Date()) {
  const next = createEmptyTaskDraft({
    ...draft,
    title: String(draft.title || '').trim(),
    task_id: String(draft.task_id || '').trim(),
    project_id: String(draft.project_id || 'custom-lab').trim(),
    project_label: String(draft.project_label || draft.project_id || 'Custom Lab').trim(),
    repo: String(draft.repo || '').trim(),
    repo_path: String(draft.repo_path || '').trim(),
    base_ref: String(draft.base_ref || 'main').trim(),
    mode: String(draft.mode || 'race').trim(),
    judge: String(draft.judge || 'claude-code').trim(),
    risk_level: String(draft.risk_level || 'medium').trim(),
    human_review_policy: String(draft.human_review_policy || 'standard').trim(),
    publish_policy: String(draft.publish_policy || 'manual').trim(),
    synthesis_policy: String(draft.synthesis_policy || 'auto').trim(),
    max_runtime_minutes: Number.parseInt(draft.max_runtime_minutes || 15, 10) || 15,
    source_system: String(draft.source_system || 'manual').trim(),
    task_template: String(draft.task_template || 'custom').trim(),
    bootstrap_style: String(draft.bootstrap_style || inferBootstrapStyle(draft)).trim(),
    init_command: String(draft.init_command || '/init').trim(),
    providers: normalizeProviders(draft.providers),
    context: String(draft.context || '').trim(),
    requirements: normalizeList(draft.requirements),
    constraints: normalizeList(draft.constraints),
    acceptance_checks: normalizeList(draft.acceptance_checks),
    optional_guidance: normalizeList(draft.optional_guidance),
    human_notes: normalizeList(draft.human_notes)
  });

  if (!next.task_id && next.title) {
    next.task_id = suggestTaskId(next.title, next.project_id, now);
  }

  return next;
}

function buildOptionalGuidance(draft) {
  const guidance = [
    bootstrapGuidance(draft),
    ...normalizeList(draft.optional_guidance)
  ].filter(Boolean);
  return Array.from(new Set(guidance));
}

function bootstrapGuidance(draft) {
  const initCommand = draft.init_command || '/init';
  if (draft.bootstrap_style === 'greenfield') {
    return `Start in the writable workspace by running your native ${initCommand} or equivalent project bootstrap command before creating files.`;
  }
  if (draft.bootstrap_style === 'existing_repo') {
    return `Start in the existing repository workspace by running your native ${initCommand} or equivalent repository-understanding command before editing files.`;
  }
  return null;
}

function normalizeProviders(providers) {
  if (!providers) {
    return [...PROVIDER_ORDER];
  }
  if (Array.isArray(providers)) {
    const normalized = providers.filter((provider) => PROVIDER_ORDER.includes(provider));
    return normalized.length > 0 ? normalized : [];
  }
  return [];
}

function inferBootstrapStyle(task = {}) {
  return task.repo_path ? 'existing_repo' : 'greenfield';
}

function normalizeList(values) {
  if (Array.isArray(values)) {
    return values.map((value) => String(value || '').trim()).filter(Boolean);
  }
  return parseMultilineList(values);
}

function formatBulletSection(entries) {
  if (!entries.length) {
    return [''];
  }
  return entries.map((entry) => `- ${entry}`);
}

function quoteIfNeeded(value) {
  const next = String(value || '');
  return /[:#\n]/.test(next) || /\s{2,}/.test(next)
    ? JSON.stringify(next)
    : next;
}
