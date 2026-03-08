import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTaskMarkdownFromDraft,
  buildTaskTemplateDraft,
  getTaskTemplatePreset,
  validateTaskDraft
} from '../ui/task-composer.mjs';

test('greenfield template adds bootstrap guidance for native init commands', () => {
  const draft = buildTaskTemplateDraft('greenfield_init', {
    title: 'Build a demo CLI',
    repo_path: '',
    init_command: '/init'
  });

  const markdown = buildTaskMarkdownFromDraft(draft);

  assert.equal(draft.bootstrap_style, 'greenfield');
  assert.match(markdown, /native \/init or equivalent project bootstrap command/i);
});

test('existing repo template warns when repo_path is missing', () => {
  const draft = buildTaskTemplateDraft('existing_repo_bugfix', {
    title: 'Fix a cache bug',
    repo_path: ''
  });

  const validation = validateTaskDraft(draft);

  assert.equal(validation.ok, true);
  assert.match(validation.warnings.join(' | '), /repo_path should point at the existing project folder/i);
});

test('task template presets expose operator-facing metadata', () => {
  const preset = getTaskTemplatePreset('security_repair');

  assert.ok(preset);
  assert.match(preset.label, /security/i);
  assert.match(preset.description, /document/i);
});
