import { Parser } from 'htmlparser2';
import type { Note } from '../types/notes';
import { sanitizeDescription } from './rich-text';

function fail(message: string): never {
  throw new Error(`[notes] ${message}`);
}

function optionalText(value: unknown, path: string): string {
  if (value == null) return '';
  if (typeof value !== 'string') return fail(`${path} はテキストである必要があります。`);
  return value.trim();
}

function publicationDate(value: unknown, path: string): string | null {
  const text = optionalText(value, path);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    return fail(`${path} はタイムゾーン付きの ISO 日時である必要があります。`);
  }
  const timestamp = Date.parse(text);
  const [year, month, day] = text.slice(0, 10).split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (!Number.isFinite(timestamp) || day < 1 || day > daysInMonth) {
    return fail(`${path} に有効な日時を設定してください。`);
  }
  return new Date(timestamp).toISOString();
}

// Receive sanitized HTML only. Parse entities once, preserving inline text while
// separating paragraphs, line breaks and table cells in the plain-text excerpt.
function excerptFromHtml(html: string): string {
  const boundaries = new Set(['p', 'br', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'hr', 'figure', 'figcaption', 'tr', 'th', 'td']);
  let text = '';
  const parser = new Parser({
    onopentag(name) { if (boundaries.has(name)) text += ' '; },
    ontext(value) { text += value; },
    onclosetag(name) { if (boundaries.has(name)) text += ' '; },
  }, { decodeEntities: true });
  parser.end(html);
  const normalized = text.replace(/\s+/gu, ' ').trim();
  const characters = Array.from(new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(normalized), (part) => part.segment);
  return characters.length > 140 ? `${characters.slice(0, 140).join('').trimEnd()}…` : normalized;
}

export function validateNotes(input: unknown): Note[] {
  if (!Array.isArray(input)) return fail('notes API はリスト形式で作成してください。');
  const seen = new Set<string>();
  const notes = input.map((entry, index): Note => {
    const path = `notes[${index}]`;
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return fail(`${path} はオブジェクトである必要があります。`);
    }
    const data = entry as Record<string, unknown>;
    const id = optionalText(data.id, `${path}.id`);
    if (!id) return fail(`${path}.id に空でないテキストを設定してください。`);
    if (seen.has(id)) return fail(`${path}.id が重複しています。`);
    seen.add(id);
    const bodyHtml = sanitizeDescription(optionalText(data.note, `${path}.note`));
    return {
      id,
      title: optionalText(data.title, `${path}.title`) || '無題',
      bodyHtml,
      excerpt: excerptFromHtml(bodyHtml),
      publishedAt: publicationDate(data.publish_date, `${path}.publish_date`),
    };
  });
  return notes.sort((a, b) => {
    if (!a.publishedAt) return b.publishedAt ? 1 : 0;
    if (!b.publishedAt) return -1;
    return b.publishedAt.localeCompare(a.publishedAt);
  });
}
