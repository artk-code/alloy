import { buildDefaultRunConfig, expandRunConfig, normalizeRunConfig } from './run-config.mjs';

const SLOT_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function buildPromptPackets(task, { runConfig = null } = {}) {
  const normalizedRunConfig = normalizeRunConfig(task, runConfig || buildDefaultRunConfig(task));
  const candidatePlan = expandRunConfig(task, normalizedRunConfig);

  return candidatePlan.map((candidate, index) => {
    const candidateSlot = SLOT_LETTERS[index] || `S${index + 1}`;
    const packet = {
      task_id: task.task_id,
      candidate_slot: candidateSlot,
      provider: candidate.provider,
      provider_instance_id: candidate.provider_instance_id,
      agent_index: candidate.agent_index,
      profile_id: candidate.profile_id,
      transport: candidate.transport,
      base_ref: task.base_ref,
      mode: task.mode,
      objective: task.title,
      hard_requirements: task.requirements,
      constraints: task.constraints,
      verification_commands: task.acceptance_checks,
      repo_context: [
        `Repository: ${task.repo}`,
        `Task source: ${task.source_system}`,
        ...(task.source_task_id ? [`Source task ID: ${task.source_task_id}`] : []),
        ...task.allowed_paths.map((path) => `Preferred path scope: ${path}`)
      ],
      optional_guidance: task.optional_guidance,
      human_notes: task.human_notes,
      allowed_paths: task.allowed_paths,
      blocked_paths: task.blocked_paths,
      working_rules: [
        'You are working in an isolated workspace.',
        'Do not manage git or jj history.',
        'Focus on code changes only.',
        'Summarize changes clearly when done.'
      ]
    };

    return {
      provider: candidate.provider,
      providerInstanceId: candidate.provider_instance_id,
      agentIndex: candidate.agent_index,
      profileId: candidate.profile_id,
      transport: candidate.transport,
      candidateSlot,
      candidateKey: `${candidateSlot.toLowerCase()}-${sanitizeCandidateKey(candidate.provider_instance_id)}`,
      packet,
      markdown: renderPromptPacketMarkdown(packet)
    };
  });
}

function renderPromptPacketMarkdown(packet) {
  const lines = [
    '# Alloy Candidate Task Packet',
    '',
    `Task ID: ${packet.task_id}`,
    `Candidate Slot: ${packet.candidate_slot}`,
    `Provider: ${packet.provider}`,
    `Provider Instance: ${packet.provider_instance_id}`,
    `Agent Index: ${packet.agent_index}`,
    `Profile: ${packet.profile_id}`,
    `Transport: ${packet.transport}`,
    `Base Ref: ${packet.base_ref}`,
    `Mode: ${packet.mode}`,
    '',
    '## Objective',
    packet.objective,
    '',
    '## Hard Requirements',
    ...packet.hard_requirements.map((item) => `- ${item}`),
    '',
    '## Constraints',
    ...packet.constraints.map((item) => `- ${item}`),
    '',
    '## Verification Commands',
    ...packet.verification_commands.map((item) => `- ${item}`),
    ''
  ];

  if (packet.repo_context.length) {
    lines.push('## Repo Context', ...packet.repo_context.map((item) => `- ${item}`), '');
  }

  if (packet.optional_guidance.length) {
    lines.push('## Optional Guidance', ...packet.optional_guidance.map((item) => `- ${item}`), '');
  }

  if (packet.human_notes.length) {
    lines.push('## Human Notes', ...packet.human_notes.map((item) => `- ${item}`), '');
  }

  lines.push('## Working Rules', ...packet.working_rules.map((item) => `- ${item}`));
  return lines.join('\n').trim() + '\n';
}

function sanitizeCandidateKey(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
