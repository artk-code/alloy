import test from 'node:test';
import assert from 'node:assert/strict';

import { renderMarkdownToHtml } from '../ui/markdown-viewer.mjs';
import { listGuideDocs, readGuideDoc } from '../src/web/docs-data.mjs';

const projectRoot = '/Users/codex/stack-judge';

test('renderMarkdownToHtml supports headings, lists, links, and fenced code blocks', () => {
  const html = renderMarkdownToHtml(`# Title\n\n- one\n- two\n\n[Guide](https://example.com)\n\n\`\`\`bash\necho ok\n\`\`\``);

  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<a href="https:\/\/example.com"/);
  assert.match(html, /<pre class="markdown-code"><code data-lang="bash">echo ok/);
});

test('docs data exposes the operator guide markdown', async () => {
  const docs = listGuideDocs();
  const guide = await readGuideDoc(projectRoot, 'operator-guide');

  assert.ok(docs.some((doc) => doc.id === 'operator-guide'));
  assert.equal(guide.id, 'operator-guide');
  assert.match(guide.title, /operator guide/i);
  assert.match(guide.markdown, /How To Generate Candidate Diffs/i);
});
