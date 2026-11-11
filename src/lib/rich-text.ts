import sanitizeHtml from 'sanitize-html';

// Only use this at build time. The returned HTML may be passed to Astro's set:html.
function safeUrl(value: string | undefined, kind: 'link' | 'image'): string | undefined {
  const input = value?.trim();
  if (!input || /[\u0000-\u0020\u007f\\]/.test(input) || input.startsWith('//')) return undefined;

  if (input.startsWith('/') || (kind === 'link' && input.startsWith('#'))) return input;

  try {
    const url = new URL(input);
    const schemes = kind === 'link' ? ['https:', 'http:', 'mailto:'] : ['https:', 'http:'];
    if (!schemes.includes(url.protocol) || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function sanitizeDescription(html: string): string {
  const clean = sanitizeHtml(html, {
    allowedTags: [
      'p', 'br', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'b', 'em', 'i', 'u', 's', 'del', 'sub', 'sup', 'mark',
      'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr', 'a',
      'figure', 'figcaption', 'img',
      'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
      ol: ['start'],
      th: ['colspan', 'rowspan', 'scope'],
      td: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowedSchemesByTag: { img: ['https', 'http'] },
    allowProtocolRelative: false,
    nonTextTags: ['script', 'style', 'textarea', 'option', 'xmp', 'noscript', 'iframe', 'object', 'embed', 'svg', 'math', 'template'],
    transformTags: {
      h1: 'h2',
      a: (tagName, attributes) => {
        const href = safeUrl(attributes.href, 'link');
        const attribs: Record<string, string> = {};
        if (href) attribs.href = href;
        if (attributes.title) attribs.title = attributes.title;
        if (href && attributes.target === '_blank') {
          attribs.target = '_blank';
          attribs.rel = 'noopener noreferrer';
        }
        return { tagName, attribs };
      },
      img: (tagName, attributes) => {
        const src = safeUrl(attributes.src, 'image');
        const attribs: Record<string, string> = { loading: 'lazy', decoding: 'async' };
        if (src) attribs.src = src;
        if (attributes.alt) attribs.alt = attributes.alt;
        if (attributes.title) attribs.title = attributes.title;
        for (const dimension of ['width', 'height']) {
          const value = attributes[dimension];
          if (value && /^\d{1,5}$/.test(value) && Number(value) > 0) attribs[dimension] = value;
        }
        return { tagName, attribs };
      },
    },
    exclusiveFilter: (frame) => {
      if (frame.tag === 'img' && !frame.attribs.src) return true;
      if (frame.tag === 'a' && !frame.attribs.href) return 'excludeTag';
      return false;
    },
  }).trim();

  // Empty editor paragraphs should use the detail page's empty-description state.
  const text = sanitizeHtml(clean, { allowedTags: [], allowedAttributes: {} });
  const hasText = text.replace(/&nbsp;|&#160;|&#x0*a0;/gi, '').replace(/[\s\u200b-\u200d\ufeff]/g, '').length > 0;
  return hasText || /<img\b/.test(clean) ? clean : '';
}
