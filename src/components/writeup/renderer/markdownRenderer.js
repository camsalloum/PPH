// renderer/markdownRenderer.js (FULL FILE)
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({
  breaks: true,
  gfm: true,
  headerIds: true,
  mangle: false
});

export function renderMarkdownToSafeHtml(markdown = '') {
  const rawHtml = marked.parse(markdown ?? '');
  return DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
}

