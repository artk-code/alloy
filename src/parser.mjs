import fs from 'node:fs/promises';

const LIST_SECTIONS = new Set([
  'requirements',
  'constraints',
  'acceptance checks',
  'optional guidance',
  'human notes'
]);

const MODES = new Set(['fast', 'race', 'relay', 'committee']);
const RISK_LEVELS = new Set(['low', 'medium', 'high']);
const REVIEW_POLICIES = new Set(['minimal', 'standard', 'strict']);
const PROVIDERS = new Set(['codex', 'gemini', 'claude-code']);

export async function parseTaskBriefFile(filePath) {
  const markdown = await fs.readFile(filePath, 'utf8');
  return parseTaskBrief(markdown, filePath);
}

export function parseTaskBrief(markdown, sourcePath = '<memory>') {
  const { frontmatter, body } = splitFrontmatter(markdown);
  const parsedFrontmatter = parseFrontmatter(frontmatter);
  const sections = parseBodySections(body);
  const normalized = normalizeTaskBrief(parsedFrontmatter, sections);
  const validation = validateTaskBrief(normalized);

  return {
    sourcePath,
    markdown,
    frontmatter: parsedFrontmatter,
    sections,
    task: normalized,
    ...validation
  };
}

function splitFrontmatter(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') {
    throw new Error('Task brief must begin with YAML frontmatter delimited by ---');
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    throw new Error('Task brief frontmatter is not closed with ---');
  }

  return {
    frontmatter: lines.slice(1, endIndex).join('\n'),
    body: lines.slice(endIndex + 1).join('\n').trim()
  };
}

function parseFrontmatter(frontmatter) {
  const result = {};
  let currentArrayKey = null;

  for (const rawLine of frontmatter.split('\n')) {
    const line = rawLine.replace(/\t/g, '  ');
    if (!line.trim()) {
      continue;
    }

    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (listMatch) {
      if (!currentArrayKey) {
        throw new Error(`Unexpected list item in frontmatter: ${rawLine}`);
      }
      result[currentArrayKey].push(cleanScalar(listMatch[1]));
      continue;
    }

    const kvMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kvMatch) {
      throw new Error(`Malformed frontmatter line: ${rawLine}`);
    }

    const [, key, rawValue] = kvMatch;
    if (rawValue === '') {
      result[key] = [];
      currentArrayKey = key;
    } else {
      result[key] = parseScalar(rawValue);
      currentArrayKey = null;
    }
  }

  return result;
}

function parseScalar(rawValue) {
  const cleaned = cleanScalar(rawValue);
  if (/^-?\d+$/.test(cleaned)) {
    return Number.parseInt(cleaned, 10);
  }
  return cleaned;
}

function cleanScalar(value) {
  return value.trim().replace(/^['"]|['"]$/g, '').replace(/\s+/g, ' ');
}

function parseBodySections(body) {
  const lines = body.split('\n');
  const sections = [];
  let current = null;

  for (const rawLine of lines) {
    const headingMatch = rawLine.match(/^(#{1,2})\s+(.*)$/);
    if (headingMatch) {
      current = {
        level: headingMatch[1].length,
        heading: headingMatch[2].trim(),
        lines: []
      };
      sections.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    current.lines.push(rawLine);
  }

  return sections.map((section) => ({
    heading: section.heading,
    normalizedHeading: section.heading.toLowerCase(),
    content: section.lines.join('\n').trim()
  }));
}

function normalizeTaskBrief(frontmatter, sections) {
  const taskSection = findSection(sections, 'task');
  const contextSection = findSection(sections, 'context');
  const requirementsSection = findSection(sections, 'requirements');
  const constraintsSection = findSection(sections, 'constraints');
  const acceptanceSection = findSection(sections, 'acceptance checks');
  const guidanceSection = findSection(sections, 'optional guidance');
  const notesSection = findSection(sections, 'human notes');

  const additionalSections = sections
    .filter((section) => ![
      'task',
      'context',
      'requirements',
      'constraints',
      'acceptance checks',
      'optional guidance',
      'human notes'
    ].includes(section.normalizedHeading))
    .map((section) => ({ heading: section.heading, content: section.content }));

  return {
    task_id: frontmatter.task_id,
    repo: frontmatter.repo,
    base_ref: frontmatter.base_ref,
    mode: frontmatter.mode,
    providers: ensureArray(frontmatter.providers),
    judge: frontmatter.judge,
    max_runtime_minutes: frontmatter.max_runtime_minutes,
    risk_level: frontmatter.risk_level,
    human_review_policy: frontmatter.human_review_policy,
    title: frontmatter.title || taskSection?.content || '',
    context: contextSection?.content || '',
    requirements: parseSectionList(requirementsSection),
    constraints: parseSectionList(constraintsSection),
    acceptance_checks: parseSectionList(acceptanceSection),
    optional_guidance: parseSectionList(guidanceSection),
    human_notes: parseSectionList(notesSection),
    allowed_paths: ensureArray(frontmatter.allowed_paths),
    blocked_paths: ensureArray(frontmatter.blocked_paths),
    tags: ensureArray(frontmatter.tags),
    synthesis_policy: frontmatter.synthesis_policy || 'auto',
    publish_policy: frontmatter.publish_policy || 'manual',
    additional_sections: additionalSections
  };
}

function findSection(sections, name) {
  return sections.find((section) => section.normalizedHeading === name);
}

function parseSectionList(section) {
  if (!section || !section.content) {
    return [];
  }

  const lines = section.content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const bulletLines = lines.filter((line) => line.startsWith('- '));
  if (bulletLines.length === lines.length) {
    return bulletLines.map((line) => line.slice(2).trim()).filter(Boolean);
  }

  if (LIST_SECTIONS.has(section.normalizedHeading)) {
    return lines.map((line) => line.replace(/^-\s+/, '').trim()).filter(Boolean);
  }

  return [section.content.trim()];
}

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  if (value === undefined || value === null || value === '') {
    return [];
  }
  return [String(value)];
}

function validateTaskBrief(task) {
  const errors = [];
  const warnings = [];

  for (const field of ['task_id', 'repo', 'base_ref', 'mode', 'judge', 'risk_level', 'human_review_policy', 'title']) {
    if (!task[field]) {
      errors.push(error('missing_required_field', field, `Field '${field}' is required.`));
    }
  }

  if (!Array.isArray(task.providers) || task.providers.length === 0) {
    errors.push(error('missing_required_field', 'providers', "Frontmatter field 'providers' is required."));
  }

  if (!MODES.has(task.mode)) {
    errors.push(error('invalid_enum', 'mode', `Unsupported mode '${task.mode}'.`));
  }

  if (!RISK_LEVELS.has(task.risk_level)) {
    errors.push(error('invalid_enum', 'risk_level', `Unsupported risk level '${task.risk_level}'.`));
  }

  if (!REVIEW_POLICIES.has(task.human_review_policy)) {
    errors.push(error('invalid_enum', 'human_review_policy', `Unsupported human review policy '${task.human_review_policy}'.`));
  }

  if (!Number.isInteger(task.max_runtime_minutes) || task.max_runtime_minutes <= 0) {
    errors.push(error('invalid_number', 'max_runtime_minutes', 'max_runtime_minutes must be a positive integer.'));
  }

  if (new Set(task.providers).size !== task.providers.length) {
    errors.push(error('duplicate_provider', 'providers', 'Providers list contains duplicates.'));
  }

  for (const provider of task.providers) {
    if (!PROVIDERS.has(provider)) {
      errors.push(error('invalid_provider', 'providers', `Unsupported provider '${provider}'.`));
    }
  }

  if (task.judge && !task.providers.includes(task.judge)) {
    errors.push(error('judge_not_in_providers', 'judge', 'For MVP, the judge must also appear in providers.'));
  }

  if (!task.requirements.length) {
    warnings.push(warning('missing_section', 'requirements', 'No requirements were parsed from the body.'));
  }

  if (!task.constraints.length) {
    warnings.push(warning('missing_section', 'constraints', 'No constraints were parsed from the body.'));
  }

  if (!task.acceptance_checks.length) {
    errors.push(error('missing_section', 'acceptance_checks', 'At least one acceptance check is required.'));
  }

  if (!task.context) {
    warnings.push(warning('missing_section', 'context', 'Task context is empty.'));
  }

  if (task.acceptance_checks.length > 10) {
    warnings.push(warning('many_acceptance_checks', 'acceptance_checks', 'More than 10 acceptance checks may slow down early demos.'));
  }

  if (task.risk_level !== 'low' && task.allowed_paths.length === 0) {
    warnings.push(warning('missing_path_scope', 'allowed_paths', 'Consider path scoping for medium/high-risk tasks.'));
  }

  return { ok: errors.length === 0, errors, warnings };
}

function error(code, field, message) {
  return { code, field, message };
}

function warning(code, field, message) {
  return { code, field, message };
}
