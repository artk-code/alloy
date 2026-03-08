const SLOT_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function buildPromptPackets(task) {
  return task.providers.map((provider, index) => {
    const candidateSlot = SLOT_LETTERS[index] || `S${index + 1}`;
    const packet = {
      task_id: task.task_id,
      candidate_slot: candidateSlot,
      provider,
      base_ref: task.base_ref,
      mode: task.mode,
      objective: task.title,
      hard_requirements: task.requirements,
      constraints: task.constraints,
      verification_commands: task.acceptance_checks,
      repo_context: [
        `Repository: ${task.repo}`,
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
      provider,
      candidateSlot,
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
