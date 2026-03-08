import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const cacheFile = path.join(projectRoot, 'src', 'projectCache.js');

const source = await fs.readFile(cacheFile, 'utf8');
if (source.includes('project.name')) {
  console.error('Demo repo still contains the invalidation bug in src/projectCache.js');
  process.exit(1);
}
