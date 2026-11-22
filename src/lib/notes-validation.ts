import type { Note, NotePhotoSection } from '../types/notes';
import { optionalText, record, requiredText, validateImage } from './cms-fields';
import { plainTextFromHtml, sanitizeDescription } from './rich-text';

function photoSection(value: unknown, path: string, allowLocalImages: boolean): NotePhotoSection | null {
  if (value == null) return null;
  const data = record(value, path);
  const list = data.photo_list ?? [];
  if (!Array.isArray(list)) throw new Error(`${path}.photo_list は画像の配列である必要があります。`);
  if (list.length === 0) return null;
  return {
    title: optionalText(data.photo_title, `${path}.photo_title`),
    photos: list.map((image, index) => validateImage(image, `${path}.photo_list[${index}]`, allowLocalImages)),
  };
}

function publicationDate(value: unknown, path: string): string | null {
  const text = optionalText(value, path);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    throw new Error(`${path} はタイムゾーン付きの ISO 日時である必要があります。`);
  }
  const timestamp = Date.parse(text);
  const [year, month, day] = text.slice(0, 10).split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (!Number.isFinite(timestamp) || day < 1 || day > daysInMonth) {
    throw new Error(`${path} に有効な日時を設定してください。`);
  }
  return new Date(timestamp).toISOString();
}

function excerptFromHtml(html: string): string {
  const normalized = plainTextFromHtml(html);
  const characters = Array.from(new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(normalized), (part) => part.segment);
  return characters.length > 140 ? `${characters.slice(0, 140).join('').trimEnd()}…` : normalized;
}

export function validateNotes(input: unknown, options: { allowLocalImages?: boolean } = {}): Note[] {
  if (!Array.isArray(input)) throw new Error('[notes] notes API はリスト形式で作成してください。');
  const seen = new Set<string>();
  const notes = input.map((entry, index): Note => {
    const path = `[notes] notes[${index}]`;
    const data = record(entry, path);
    const id = requiredText(data.id, `${path}.id`);
    if (seen.has(id)) throw new Error(`${path}.id が重複しています。`);
    seen.add(id);
    const bodyHtml = sanitizeDescription(optionalText(data.note, `${path}.note`));
    return {
      id,
      title: optionalText(data.title, `${path}.title`) || '無題',
      bodyHtml,
      excerpt: excerptFromHtml(bodyHtml),
      publishedAt: publicationDate(data.publishedAt, `${path}.publishedAt`),
      photoSection: photoSection(data.note_photo, `${path}.note_photo`, options.allowLocalImages ?? false),
    };
  });
  return notes.sort((a, b) => {
    if (!a.publishedAt) return b.publishedAt ? 1 : 0;
    if (!b.publishedAt) return -1;
    return b.publishedAt.localeCompare(a.publishedAt);
  });
}
