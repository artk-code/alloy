import fs from 'node:fs/promises';
import path from 'node:path';

const DOCS = {
  'operator-guide': {
    id: 'operator-guide',
    title: 'Operator Guide',
    description: 'How to run Alloy demos, baseline evals, candidate runs, and compare diffs.',
    filePath: ['docs', 'OPERATOR_GUIDE.md']
  }
};

export async function readGuideDoc(projectRoot, docId = 'operator-guide') {
  const doc = DOCS[docId];
  if (!doc) {
    return null;
  }

  const absolutePath = path.join(projectRoot, ...doc.filePath);
  const markdown = await fs.readFile(absolutePath, 'utf8');
  return {
    id: doc.id,
    title: doc.title,
    description: doc.description,
    markdown,
    path: absolutePath
  };
}

export function listGuideDocs() {
  return Object.values(DOCS).map((doc) => ({
    id: doc.id,
    title: doc.title,
    description: doc.description
  }));
}
