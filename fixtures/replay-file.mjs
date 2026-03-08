import fs from 'node:fs/promises';
import path from 'node:path';

const provider = process.argv[2] || 'unknown';
const sourcePath = process.argv[3];
const targetRelativePath = process.argv[4];
const summary = process.argv[5] || `${provider} replay complete`;

async function main() {
  if (!sourcePath || !targetRelativePath) {
    console.error('usage: node replay-file.mjs <provider> <source-path> <target-relative-path> [summary]');
    process.exit(2);
  }

  const targetPath = path.join(process.cwd(), targetRelativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  console.error(`${provider}: starting replay`);
  console.log(JSON.stringify({ type: 'session.started', provider }));

  await fs.copyFile(sourcePath, targetPath);
  console.log(JSON.stringify({
    type: 'file.updated',
    provider,
    file: targetRelativePath,
    source: sourcePath
  }));

  console.error(`${provider}: finishing replay`);
  console.log(JSON.stringify({ type: 'session.completed', provider, summary }));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
