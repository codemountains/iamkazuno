import type { PickSearchHit } from '../lib/picks-search';

interface SearchResult {
  id: string;
  matchedMetaFields?: string[];
  data(): Promise<{ meta: Record<string, string>; excerpt: string }>;
}

interface SearchEngine {
  search(term: string): Promise<{ results: SearchResult[] }>;
}

interface SearchBundle {
  createInstance(options: {
    noWorker: boolean;
    ranking: { metaWeights: Record<string, number> };
  }): SearchEngine;
}

interface SearchPaths {
  paths: Record<string, string>;
  aliasFieldCount: number;
}

let engine: Promise<{ client: SearchEngine; paths: SearchPaths['paths'] }> | undefined;
let importFailures = 0;

async function loadBundle(): Promise<SearchBundle> {
  // Pagefind はビルド後に生成される。検索を始めた時だけブラウザから読み込む。
  const url = '/pagefind/pagefind.js' + (importFailures ? `?retry=${importFailures}` : '');
  try {
    return await import(/* @vite-ignore */ url);
  } catch (error) {
    importFailures++;
    throw error;
  }
}

async function loadPaths(): Promise<SearchPaths> {
  const response = await fetch('/pagefind/picks-paths.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error(`[picks] Search paths: ${response.status}`);
  return response.json();
}

async function loadEngine() {
  const [bundle, { paths, aliasFieldCount }] = await Promise.all([loadBundle(), loadPaths()]);
  const metaWeights: Record<string, number> = {
    title: 10,
    variant: 10,
    brand: 8,
    description: 0,
    alias_labels: 0,
  };
  for (let i = 0; i < aliasFieldCount; i++) metaWeights[`alias_${i}`] = 3;
  const client = bundle.createInstance({ noWorker: true, ranking: { metaWeights } });
  return { client, paths };
}

export async function searchPicks(term: string): Promise<Map<string, PickSearchHit>> {
  const loading = (engine ??= loadEngine());
  try {
    const { client, paths } = await loading;
    const { results } = await client.search(term);
    const hits = new Map<string, PickSearchHit>();
    for (const result of results) {
      const path = paths[result.id];
      if (!path) throw new Error(`[picks] Missing search path: ${result.id}`);
      const matchedMetaFields = result.matchedMetaFields;
      hits.set(path, {
        matchedMetaFields,
        async loadEvidence() {
          try {
            const { meta, excerpt } = await result.data();
            return {
              matchedMetaFields,
              description: meta.description,
              aliases: meta.alias_labels?.split('\n'),
              excerpt,
            };
          } catch {
            // 候補の補足が取得できない場合も、商品名やブランドと一覧は利用できる。
            return { matchedMetaFields };
          }
        },
      });
    }
    return hits;
  } catch (error) {
    if (loading === engine) engine = undefined;
    throw error;
  }
}
