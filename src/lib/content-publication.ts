import type { ContentConfiguration } from '../types/content';

const statuses = new Set(['PUBLISH', 'DRAFT', 'CLOSED', 'PUBLISH_AND_DRAFT']);

// Content APIではstatusを取得できず、下書きに戻してもpublishedAtは残る。
// Management APIで「公開中のみ」のIDを確認し、下書き版をビルドに含めない。
export async function getPublishedThingIds(
  config: Extract<ContentConfiguration, { source: 'microcms' }>,
): Promise<Set<string>> {
  const publishedIds = new Set<string>();
  const seen = new Set<string>();
  const limit = 100;
  let offset = 0;

  try {
    while (true) {
      const url = new URL(`https://${config.serviceDomain}.microcms-management.io/api/v1/contents/things`);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('offset', String(offset));
      const response = await fetch(url, {
        headers: { 'X-MICROCMS-API-KEY': config.apiKey },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('Publication metadata request failed.');

      const data: unknown = await response.json();
      if (typeof data !== 'object' || data === null || !('contents' in data) || !('totalCount' in data)) {
        throw new Error('Invalid publication metadata.');
      }
      const { contents, totalCount } = data;
      if (!Array.isArray(contents) || typeof totalCount !== 'number' || !Number.isSafeInteger(totalCount) || totalCount < 0) {
        throw new Error('Invalid publication metadata list.');
      }

      for (const item of contents) {
        if (typeof item !== 'object' || item === null
          || typeof item.id !== 'string' || !item.id.trim() || seen.has(item.id)
          || !Array.isArray(item.status) || item.status.length === 0
          || !item.status.every((status: unknown) => typeof status === 'string' && statuses.has(status))) {
          throw new Error('Invalid content publication status.');
        }
        seen.add(item.id);
        if (item.status.length === 1 && item.status[0] === 'PUBLISH') publishedIds.add(item.id);
      }

      offset += contents.length;
      if (offset >= totalCount) return publishedIds;
      if (contents.length === 0) throw new Error('Incomplete publication metadata.');
    }
  } catch {
    // メタ情報にはdraftKey等も含まれるため、レスポンスや認証情報をログに出さない。
    throw new Error(
      '[picks] thingsの公開状態を確認できません。microCMSのマネジメントAPI権限「コンテンツの取得 (一覧・詳細)」と通信状態を確認してください。下書きの混入を防ぐためビルドを中止します。',
    );
  }
}
