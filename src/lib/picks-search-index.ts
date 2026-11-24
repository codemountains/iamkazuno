import { gunzipSync } from 'node:zlib';
import { createIndex, type CustomRecord } from 'pagefind';
import type { Thing } from '../types/content';
import { preparePagefindModule } from './pagefind-browser-module';
import { thingPath } from './paths';
import { normalizeSearchQuery } from './picks-search';
import { plainTextFromHtml } from './rich-text';

const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });
function normalizedWords(text: string): string {
  return Array.from(segmenter.segment(text))
    .filter((part) => part.isWordLike)
    .map((part) => normalizeSearchQuery(part.segment))
    .join(' ');
}

// 型番の区切り方は入力によって異なる。SC-35 / SC35 の両方から引けるようにする。
function indexedName(value: string): string {
  const normalized = normalizeSearchQuery(value);
  const forms = new Set([value, normalized, normalizedWords(normalized)]);
  for (const { 0: identifier } of normalized.matchAll(/[a-z\d]+(?: [a-z\d]+)*/g)) {
    const words = identifier.split(' ');
    if (words.length > 1) {
      forms.add(words.join(''));
      for (let i = 1; i < words.length; i++) forms.add(words[i - 1] + words[i]);
    }
    const expanded = identifier.replace(/(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])/g, ' ');
    if (expanded !== identifier) forms.add(expanded);
  }
  return [...forms].join(' ');
}

export function picksSearchRecord(thing: Thing): CustomRecord {
  const description = plainTextFromHtml(thing.descriptionHtml);
  // Pagefind は本文が空のレコードを索引に含めない。
  const text =
    [description, ...thing.categories.map(({ name }) => name)].join(' ').trim() || thing.name;
  // 検索窓と同じ順序で、分かち書きの前に文全体のかな・英数を正規化する。
  const foldedText = normalizeSearchQuery(text);
  const aliases = [...(thing.searchAliases ?? []), ...(thing.brand?.searchAliases ?? [])];
  return {
    url: thingPath(thing.id),
    language: 'ja',
    content: foldedText === text ? text : `${text} ${foldedText}`,
    meta: {
      title: indexedName(thing.name),
      ...(thing.variantLabel && { variant: indexedName(thing.variantLabel) }),
      brand: indexedName(thing.brand?.name ?? ''),
      ...Object.fromEntries(aliases.map((alias, i) => [`alias_${i}`, indexedName(alias)])),
      // 正規化した索引語とは別に、候補に表示する表記を同じ検索結果から取得できるようにする。
      description,
      alias_labels: aliases.join('\n'),
    },
  };
}

function checkErrors(errors: string[]) {
  if (errors.length) throw new Error(`[picks] Pagefind: ${errors.join('\n')}`);
}

export async function buildPicksSearch(things: Thing[]) {
  // 候補になった商品だけの詳細を取得できるよう、商品ごとにフラグメントを生成する。
  const { index, errors } = await createIndex();
  checkErrors(errors);
  if (!index) throw new Error('[picks] Pagefind の索引を初期化できませんでした。');
  try {
    let aliasFieldCount = 0;
    for (const thing of things) {
      const record = picksSearchRecord(thing);
      const aliasFields = Object.keys(record.meta ?? {}).filter((field) =>
        /^alias_\d+$/.test(field),
      );
      aliasFieldCount = Math.max(aliasFieldCount, aliasFields.length);
      const result = await index.addCustomRecord(record);
      checkErrors(result.errors);
    }
    const result = await index.getFiles();
    checkErrors(result.errors);
    // Pagefind の検索結果にはフラグメント ID だけが含まれる。ビルド時に一覧用のパスを取り出す。
    const paths: Record<string, string> = {};
    for (const { path, content } of result.files) {
      const fragment = /^fragment\/(.+)\.pf_fragment$/.exec(path);
      if (!fragment) continue;
      const json = gunzipSync(content).toString('utf8');
      if (!json.startsWith('pagefind_dcd'))
        throw new Error(`[picks] Unknown Pagefind fragment format: ${path}`);
      const { url } = JSON.parse(json.slice('pagefind_dcd'.length));
      if (typeof url !== 'string')
        throw new Error(`[picks] Missing Pagefind fragment URL: ${path}`);
      paths[fragment[1]] = url;
    }
    // Picks は独自の UI とメインスレッド検索を使うため、標準 UI と Worker は配信対象外。
    const files = result.files
      .filter(({ path }) => path === 'pagefind.js' || !/\.(?:js|css)$/.test(path))
      .map(({ path, content }) => ({
        path,
        content: path === 'pagefind.js' ? preparePagefindModule(content) : content,
      }));
    files.push({
      path: 'picks-paths.json',
      content: new TextEncoder().encode(JSON.stringify({ paths, aliasFieldCount })),
    });
    return files;
  } finally {
    await index.deleteIndex();
  }
}
