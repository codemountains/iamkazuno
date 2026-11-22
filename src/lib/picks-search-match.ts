import { normalizeSearchQuery, type PickSearchEvidence } from './picks-search';

export interface MatchPart {
  text: string;
  matched: boolean;
}

interface SearchFields extends PickSearchEvidence {
  title: string;
  brand?: string;
}

interface PickSearchMatch {
  title: MatchPart[];
  brand: MatchPart[];
  detail?: { kind: 'alias' | 'description'; parts: MatchPart[] };
}

const graphemes =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('ja', { granularity: 'grapheme' })
    : undefined;
const words =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('ja', { granularity: 'word' })
    : undefined;
const modelSeparator = /^[\s‐‑‒–—―−ー-]+$/u;

// 正規化で文字数が変わるため、検索用文字列の各位置から原文の書記素へ戻れるようにする。
function project(text: string) {
  const original = graphemes
    ? Array.from(graphemes.segment(text), ({ segment }) => segment)
    : Array.from(text);
  const units = original.map((char) => normalizeSearchQuery(char) || ' ');
  const offsets: number[] = [];
  let folded = '';
  for (let i = 0; i < units.length; i++) {
    // 英数の間にある型番の区切りだけを詰める。コーヒー等の長音は原文どおりに残す。
    if (/[a-z\d]$/.test(units[i - 1] ?? '') && modelSeparator.test(units[i])) {
      let next = i + 1;
      while (next < units.length && modelSeparator.test(units[next])) next++;
      if (/^[a-z\d]/.test(units[next] ?? '')) i = next;
    }
    folded += units[i];
    for (let unit = 0; unit < units[i].length; unit++) offsets.push(i);
  }
  return { original, folded, offsets };
}

function matchText(text: string, terms: string[], excerpt = false) {
  const found = new Set<string>();
  const plain = { found, parts: text ? [{ text, matched: false }] : [] };
  if (!text || !terms.length) return plain;
  const { original, folded, offsets } = project(text);
  const hits = new Uint8Array(folded.length);
  for (const term of terms) {
    for (let at = folded.indexOf(term); at !== -1; at = folded.indexOf(term, at + term.length)) {
      found.add(term);
      hits.fill(1, at, at + term.length);
    }
  }
  if (!found.size) return plain;

  const ranges = [];
  for (let at = hits.indexOf(1); at !== -1;) {
    const next = hits.indexOf(0, at);
    const last = (next < 0 ? hits.length : next) - 1;
    ranges.push({ start: offsets[at], end: offsets[last] + 1 });
    at = next < 0 ? -1 : hits.indexOf(1, next);
  }
  // 「行動食」のような複合語は、先に出る単独の「食」より連続した一致箇所を抜き出す。
  const best = ranges.reduce((a, b) => (a.end - a.start >= b.end - b.start ? a : b));
  const start = excerpt ? Math.max(0, best.start - 8) : 0;
  const end = excerpt ? Math.min(original.length, start + 40) : original.length;
  const parts: MatchPart[] = [];
  if (start > 0) parts.push({ text: '…', matched: false });
  let cursor = start;
  for (const range of ranges) {
    if (range.end <= cursor) continue;
    if (range.start >= end) break;
    const from = Math.max(cursor, range.start);
    const to = Math.min(end, range.end);
    if (cursor < from) parts.push({ text: original.slice(cursor, from).join(''), matched: false });
    if (from < to) parts.push({ text: original.slice(from, to).join(''), matched: true });
    cursor = to;
  }
  const tail = original.slice(cursor, end).join('') + (end < original.length ? '…' : '');
  if (tail) parts.push({ text: tail, matched: false });
  return { parts, found };
}

function searchWords(text: string) {
  const normalized = normalizeSearchQuery(text);
  return [
    ...new Set(
      words
        ? Array.from(words.segment(normalized))
            .filter((part) => part.isWordLike)
            .map((part) => part.segment)
        : normalized.split(' ').filter(Boolean),
    ),
  ];
}

function matchName(name: string, terms: string[], fieldMatched: boolean) {
  const exact = matchText(name, terms);
  if (!fieldMatched || !name || exact.found.size === terms.length) return exact;
  // Pagefind が長い検索語を短い登録語に一致させる場合（samples → SAMPLE）。
  const nameWords = searchWords(name);
  const marks = new Set(exact.found);
  for (const term of terms) {
    if (exact.found.has(term)) continue;
    const shorter = nameWords.filter((word) => term.startsWith(word));
    if (shorter.length) {
      exact.found.add(term);
      for (const word of shorter) marks.add(word);
    }
  }
  if (marks.size) return { parts: matchText(name, [...marks]).parts, found: exact.found };
  // 一致したフィールドしか分からないときは、その登録名を表示する。
  return {
    parts: [{ text: name, matched: true }],
    found: terms.length === 1 ? new Set(terms) : exact.found,
  };
}

function excerptTerms(excerpt: string) {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
  };
  return Array.from(excerpt.matchAll(/<mark>([^<]*)<\/mark>/g), ([, text]) =>
    normalizeSearchQuery(text.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => entities[entity])),
  ).filter(Boolean);
}

export function getPickSearchMatch(query: string, fields: SearchFields): PickSearchMatch {
  const terms = searchWords(query);
  const matched = new Set(fields.matchedMetaFields);
  const title = matchName(fields.title, terms, matched.has('title'));
  const brand = matchName(fields.brand ?? '', terms, matched.has('brand'));
  const result: PickSearchMatch = { title: title.parts, brand: brand.parts };
  const remaining = terms.filter((term) => !title.found.has(term) && !brand.found.has(term));
  if (!remaining.length) return result;

  const aliases = fields.aliases ?? [];
  const matchedAliases = aliases.filter((_, i) => matched.has(`alias_${i}`));
  let best = 0;
  for (const alias of fields.matchedMetaFields ? matchedAliases : aliases) {
    const match = matchText(alias, terms);
    // 別名を出すかは未説明の語で決める。表示するときは商品名と重なる部分も強調する。
    const explained = remaining.filter((term) => match.found.has(term)).length;
    if (explained <= best) continue;
    result.detail = { kind: 'alias', parts: match.parts };
    best = explained;
    if (best === remaining.length) return result;
  }
  const description = matchText(fields.description ?? '', remaining, true);
  if (description.found.size > best)
    result.detail = { kind: 'description', parts: description.parts };
  if (!result.detail && matchedAliases.length) {
    result.detail = { kind: 'alias', parts: [{ text: matchedAliases[0], matched: true }] };
  }
  if (!result.detail && fields.excerpt && fields.description) {
    // 検索エンジンの一致語を使い、画面には索引用の表記ではなく元の説明文を抜き出す。
    const excerpt = matchText(fields.description, excerptTerms(fields.excerpt), true);
    if (excerpt.found.size) result.detail = { kind: 'description', parts: excerpt.parts };
  }
  return result;
}
