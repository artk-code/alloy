import fs from 'node:fs/promises';
import path from 'node:path';

const prompt = process.argv.slice(2).join(' ');

const recommendationMatch = prompt.match(/Write valid JSON to:\s+([^\n]+)/i);
const notesMatch = prompt.match(/Optionally write a short markdown note to:\s+([^\n]+)/i);
const recommendationPath = recommendationMatch ? recommendationMatch[1].trim() : 'codex-recommendation.json';
const notesPath = notesMatch ? notesMatch[1].trim() : 'codex-recommendation.md';

const recommendation = {
  recommended_mode: 'winner_finalize',
  recommended_base_blind_id: 'candidate_a',
  confidence: 'high',
  summary: 'Candidate A remains the safest deterministic winner after blind review.',
  reasons: [
    'Verification already passed.',
    'No additional contested files need composition.'
  ],
  file_overrides: [],
  human_approval_required: true
};

await fs.writeFile(path.resolve(process.cwd(), recommendationPath), JSON.stringify(recommendation, null, 2) + '\n', 'utf8');
await fs.writeFile(path.resolve(process.cwd(), notesPath), '# Blind Review Note\n\nCandidate A is recommended.\n', 'utf8');
process.stdout.write(JSON.stringify({ status: 'ok', recommendation_path: recommendationPath }) + '\n');
