// Build-time only: import this module from Astro frontmatter, never a client script.
import { createClient } from 'microcms-js-sdk';
import { sampleBrands, sampleCategories, sampleThings } from '../data/sample';
import type { Content, ContentEnvironment } from '../types/content';
import { resolveContentConfiguration, validateBrands, validateCategories, validateThings } from './content-validation';

// Astro's build-time replacement requires explicit references to private env keys.
export async function getContent(env: ContentEnvironment = {
  DATA_SOURCE: import.meta.env.DATA_SOURCE,
  MICROCMS_SERVICE_DOMAIN: import.meta.env.MICROCMS_SERVICE_DOMAIN,
  MICROCMS_API_KEY: import.meta.env.MICROCMS_API_KEY,
}): Promise<Content> {
  const config = resolveContentConfiguration(env);

  if (config.source === 'sample') {
    const brands = validateBrands(sampleBrands);
    const categories = validateCategories(sampleCategories);
    return {
      brands,
      categories,
      things: validateThings(sampleThings, brands, categories, { allowLocalImages: true }),
      source: 'sample',
    };
  }

  const client = createClient({ serviceDomain: config.serviceDomain, apiKey: config.apiKey });
  let rawBrands: unknown;
  let rawCategories: unknown;
  let rawThings: unknown;
  try {
    [rawBrands, rawCategories, rawThings] = await Promise.all([
      client.getAllContents({ endpoint: 'brands', queries: { fields: 'id,name' } }),
      client.getAllContents({ endpoint: 'categories', queries: { fields: 'id,name' } }),
      client.getAllContents({
        endpoint: 'things',
        queries: { fields: 'id,name,description,main_image,ref_brand,ref_categories', depth: 1 },
      }),
    ]);
  } catch {
    // Never replace failed production content with demo data or print request credentials.
    throw new Error(
      '[picks] microCMSの取得に失敗しました。接続情報、APIキーのGET権限、things / brands / categories API、通信状態を確認してください。サンプルへの自動切り替えは行いません。',
    );
  }

  const brands = validateBrands(rawBrands);
  const categories = validateCategories(rawCategories);
  return { brands, categories, things: validateThings(rawThings, brands, categories), source: 'microcms' };
}
