export function renderMarkdownInto(root, markdown) {
  root.innerHTML = renderMarkdownToHtml(markdown || '');
}

export function renderMarkdownToHtml(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    const codeFence = /^```([^`]*)$/.exec(trimmed);
    if (codeFence) {
      const language = escapeHtml(codeFence[1].trim());
      const buffer = [];
      i += 1;
      while (i < lines.length && !/^```$/.test(lines[i].trim())) {
        buffer.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(`<pre class="markdown-code"><code${language ? ` data-lang="${language}"` : ''}>${escapeHtml(buffer.join('\n'))}</code></pre>`);
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push('<hr>');
      i += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push(`<blockquote>${quoteLines.map((entry) => `<p>${renderInline(entry)}</p>`).join('')}</blockquote>`);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(`<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(`<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ol>`);
      continue;
    }

    const paragraphLines = [];
    while (i < lines.length && lines[i].trim() && !isBlockBoundary(lines[i].trim())) {
      paragraphLines.push(lines[i].trim());
      i += 1;
    }
    blocks.push(`<p>${renderInline(paragraphLines.join(' '))}</p>`);
  }

  return blocks.join('\n');
}

function isBlockBoundary(trimmed) {
  return /^```/.test(trimmed)
    || /^#{1,6}\s+/.test(trimmed)
    || /^[-*]\s+/.test(trimmed)
    || /^\d+\.\s+/.test(trimmed)
    || /^>\s?/.test(trimmed)
    || /^---+$/.test(trimmed);
}

function renderInline(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const safeHref = sanitizeHref(href);
    return `<a href="${safeHref}" target="_blank" rel="noreferrer">${label}</a>`;
  });
  return html;
}

function sanitizeHref(href) {
  const value = String(href || '').trim();
  if (/^(https?:|mailto:|\/)/i.test(value)) {
    return escapeHtml(value);
  }
  return '#';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
