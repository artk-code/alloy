import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTaskBriefFile } from './parser.mjs';
import { buildPromptPackets } from './prompt-packets.mjs';
import { materializeRunArtifacts } from './artifacts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node src/cli.mjs <task-brief.md>');
    process.exit(1);
  }

  const absoluteInputPath = path.resolve(process.cwd(), inputPath);
  const parsed = await parseTaskBriefFile(absoluteInputPath);

  if (!parsed.ok) {
    console.error('Task brief validation failed.');
    console.error(JSON.stringify({ errors: parsed.errors, warnings: parsed.warnings }, null, 2));
    process.exit(1);
  }

  const packets = buildPromptPackets(parsed.task);
  const result = await materializeRunArtifacts({ projectRoot, parsed, packets });

  console.log(JSON.stringify({
    task_id: parsed.task.task_id,
    run_dir: result.runDir,
    warnings: parsed.warnings,
    prompt_packets: packets.map((packet) => ({ provider: packet.provider, slot: packet.candidateSlot })),
    candidates: result.manifests
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
