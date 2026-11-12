import type {
  Brand,
  Category,
  ContentConfiguration,
  ContentEnvironment,
  PickImage,
  Thing,
} from '../types/content';
import { sanitizeDescription } from './rich-text';

function fail(message: string): never {
  throw new Error(`[picks] ${message}`);
}

export function resolveContentConfiguration(env: ContentEnvironment): ContentConfiguration {
  const mode = env.DATA_SOURCE?.trim() || 'auto';
  if (mode !== 'auto' && mode !== 'sample' && mode !== 'microcms') {
    return fail('DATA_SOURCE は auto / sample / microcms のいずれかを指定してください。');
  }

  const serviceDomain = env.MICROCMS_SERVICE_DOMAIN?.trim() || '';
  const apiKey = env.MICROCMS_API_KEY?.trim() || '';

  if (Boolean(serviceDomain) !== Boolean(apiKey)) {
    return fail('MICROCMS_SERVICE_DOMAIN と MICROCMS_API_KEY は両方を設定してください。');
  }

  if (mode === 'sample' || (mode === 'auto' && !serviceDomain && !apiKey)) {
    return { source: 'sample' };
  }

  if (!serviceDomain || !apiKey) {
    return fail('DATA_SOURCE=microcms には MICROCMS_SERVICE_DOMAIN と MICROCMS_API_KEY が必要です。');
  }

  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(serviceDomain)) {
    return fail('MICROCMS_SERVICE_DOMAIN は https:// や .microcms.io を除いたサービスIDを指定してください。');
  }

  return { source: 'microcms', serviceDomain, apiKey };
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(`${path} はオブジェクトである必要があります。`);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    return fail(`${path} に空でないテキストを設定してください。`);
  }
  return value.trim();
}

function optionalText(value: unknown, path: string): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return fail(`${path} はテキストである必要があります。`);
  return value.trim();
}

function httpUrl(value: unknown, path: string): string {
  const text = requiredText(value, path);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return fail(`${path} に完全な HTTP または HTTPS URL を設定してください。`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    return fail(`${path} は認証情報を含まない HTTP または HTTPS URL を指定してください。`);
  }
  return url.href;
}

function image(value: unknown, path: string, allowLocalImages: boolean): PickImage {
  const input = record(value, path);
  const rawUrl = requiredText(input.url, `${path}.url`);
  const url = allowLocalImages && /^\/images\/samples\/[a-z0-9-]+\.svg$/.test(rawUrl)
    ? rawUrl
    : httpUrl(rawUrl, `${path}.url`);

  for (const key of ['width', 'height'] as const) {
    if (typeof input[key] !== 'number' || !Number.isSafeInteger(input[key]) || input[key] <= 0) {
      return fail(`${path}.${key} は正の整数である必要があります。`);
    }
  }

  const alt = optionalText(input.alt, `${path}.alt`);
  return {
    url,
    width: input.width as number,
    height: input.height as number,
    ...(alt ? { alt } : {}),
  };
}

function namedContents(input: unknown, endpoint: 'brands' | 'categories', fallbackName: string): Array<Brand | Category> {
  if (!Array.isArray(input)) return fail(`${endpoint} API はリスト形式で作成してください。`);
  const seen = new Set<string>();
  return input.map((entry, index) => {
    const path = `${endpoint}[${index}]`;
    const data = record(entry, path);
    const id = requiredText(data.id, `${path}.id`);
    if (seen.has(id)) return fail(`${path}.id が重複しています。`);
    seen.add(id);
    return { id, name: optionalText(data.name, `${path}.name`) || fallbackName };
  });
}

export function validateBrands(input: unknown): Brand[] {
  return namedContents(input, 'brands', '名前のないブランド');
}

export function validateCategories(input: unknown): Category[] {
  return namedContents(input, 'categories', '名前のないカテゴリ');
}

function referenceId(value: unknown, path: string): string | null {
  if (value === undefined || value === null) return null;
  return requiredText(record(value, path).id, `${path}.id`);
}

export function validateThings(
  input: unknown,
  brands: Brand[],
  categories: Category[],
  options: { allowLocalImages?: boolean } = {},
): Thing[] {
  if (!Array.isArray(input)) return fail('things API はリスト形式で作成してください。');
  const knownBrands = new Map(brands.map((brand) => [brand.id, brand]));
  const knownCategories = new Map(categories.map((category) => [category.id, category]));
  const seen = new Set<string>();

  return input.map((entry, index) => {
    const path = `things[${index}]`;
    const data = record(entry, path);
    const id = requiredText(data.id, `${path}.id`);
    if (seen.has(id)) return fail(`${path}.id が重複しています。`);
    seen.add(id);
    const brandId = referenceId(data.ref_brand, `${path}.ref_brand`);
    const references = data.ref_categories ?? [];
    if (!Array.isArray(references)) return fail(`${path}.ref_categories は複数コンテンツ参照である必要があります。`);
    const selectedCategories = new Map<string, Category>();
    for (const [referenceIndex, reference] of references.entries()) {
      const categoryId = referenceId(reference, `${path}.ref_categories[${referenceIndex}]`);
      const category = categoryId ? knownCategories.get(categoryId) : undefined;
      // Missing or unpublished references are optional; do not invent categories.
      if (category) selectedCategories.set(category.id, category);
    }

    return {
      id,
      name: optionalText(data.name, `${path}.name`) || '名前のないアイテム',
      brand: brandId ? knownBrands.get(brandId) ?? null : null,
      image: data.main_image == null ? null : image(data.main_image, `${path}.main_image`, options.allowLocalImages ?? false),
      descriptionHtml: sanitizeDescription(optionalText(data.description, `${path}.description`)),
      categories: [...selectedCategories.values()],
    };
  });
}
