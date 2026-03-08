import { renderMarkdownInto } from './markdown-viewer.mjs';
import { initThemeToggle } from './theme.mjs';

const state = {
  docId: new URLSearchParams(window.location.search).get('doc') || 'operator-guide',
  taskId: new URLSearchParams(window.location.search).get('task') || null,
  docs: [],
  currentDoc: null
};

const docsListRoot = document.querySelector('#docs-list');
const docsContentRoot = document.querySelector('#docs-content');
const docsTitleRoot = document.querySelector('#docs-title');
const docsSubtitleRoot = document.querySelector('#docs-subtitle');
const docsContentTitleRoot = document.querySelector('#docs-content-title');
const docsCrumbRoot = document.querySelector('#docs-crumb');
const docsHomeLink = document.querySelector('#docs-home-link');
const docsOperatorLink = document.querySelector('#docs-operator-link');
const docsCompareLink = document.querySelector('#docs-compare-link');
const toastStack = document.querySelector('#toast-stack');

initThemeToggle();

document.querySelector('#refresh-docs').addEventListener('click', () => boot());

boot().catch((error) => {
  renderFailure(error);
  showToast({
    title: 'Docs failed to load',
    lines: [error.message || String(error)],
    tone: 'danger',
    timeoutMs: 9000
  });
});

async function boot() {
  await Promise.all([loadDocsList(), loadCurrentDoc()]);
  renderPage();
}

async function loadDocsList() {
  const response = await fetch('/api/docs');
  const payload = await response.json();
  state.docs = payload.docs || [];
}

async function loadCurrentDoc() {
  const response = await fetch(`/api/docs/${encodeURIComponent(state.docId)}`);
  if (!response.ok) {
    throw new Error(`Doc not available from the current server: ${state.docId} (${response.status})`);
  }
  state.currentDoc = await response.json();
}

function renderPage() {
  docsTitleRoot.textContent = 'Docs';
  docsSubtitleRoot.textContent = state.currentDoc?.description || 'Operator instructions for Alloy.';
  docsContentTitleRoot.textContent = state.currentDoc?.title || 'Guide';
  docsCrumbRoot.textContent = state.currentDoc?.title || 'Guide';
  document.title = state.currentDoc?.title ? `Alloy Docs - ${state.currentDoc.title}` : 'Alloy Docs';

  docsHomeLink.href = state.taskId ? `/?task=${encodeURIComponent(state.taskId)}` : '/';
  docsOperatorLink.href = state.taskId ? `/tasks.html?task=${encodeURIComponent(state.taskId)}` : '/tasks.html';
  docsCompareLink.href = state.taskId ? `/review.html?task=${encodeURIComponent(state.taskId)}` : '/review.html';

  renderDocsList();
  renderMarkdownInto(docsContentRoot, state.currentDoc?.markdown || '');
}

function renderFailure(error) {
  docsListRoot.innerHTML = '';
  docsContentRoot.innerHTML = '';
  docsTitleRoot.textContent = 'Docs';
  docsContentTitleRoot.textContent = 'Docs unavailable';
  docsCrumbRoot.textContent = 'Unavailable';
  docsSubtitleRoot.textContent = 'The docs shell loaded, but the current server did not provide the docs content API.';

  appendInfoBlock(
    docsListRoot,
    'Docs API',
    'This page needs the current Alloy server with `/api/docs` routes enabled.'
  );

  appendInfoBlock(
    docsContentRoot,
    'What happened',
    error?.message || String(error)
  );

  appendInfoBlock(
    docsContentRoot,
    'Likely fix',
    'Restart `npm run web` from the current Alloy tree so the server picks up the new docs routes.'
  );
}

function renderDocsList() {
  docsListRoot.innerHTML = '';
  for (const doc of state.docs) {
    const article = document.createElement('article');
    article.className = 'info-block';
    const title = document.createElement('h4');
    title.textContent = doc.title;
    const body = document.createElement('p');
    body.textContent = doc.description;
    const button = document.createElement('a');
    button.className = doc.id === state.docId ? 'nav-link is-active' : 'nav-link';
    button.href = buildDocUrl(doc.id, state.taskId);
    button.textContent = doc.id === state.docId ? 'Open' : 'View';
    article.append(title, body, button);
    docsListRoot.appendChild(article);
  }
}

function buildDocUrl(docId, taskId) {
  const params = new URLSearchParams({ doc: docId });
  if (taskId) {
    params.set('task', taskId);
  }
  return `/docs.html?${params.toString()}`;
}

function appendInfoBlock(root, heading, body) {
  const block = document.createElement('div');
  block.className = 'info-block';
  const title = document.createElement('h4');
  title.textContent = heading;
  const paragraph = document.createElement('p');
  paragraph.textContent = body;
  block.append(title, paragraph);
  root.appendChild(block);
}

function showToast({ title, lines = [], tone = 'info', timeoutMs = 6000 }) {
  const toast = document.createElement('article');
  toast.className = `toast toast-${tone}`;
  const heading = document.createElement('strong');
  heading.textContent = title;
  toast.appendChild(heading);
  for (const line of lines) {
    const paragraph = document.createElement('p');
    paragraph.textContent = line;
    toast.appendChild(paragraph);
  }
  toastStack.appendChild(toast);
  window.setTimeout(() => toast.remove(), timeoutMs);
}
