import type {
  Brand,
  Category,
  ContentConfiguration,
  ContentEnvironment,
  Thing,
} from '../types/content';
import { optionalText, record, requiredText, validateImage } from './cms-fields';
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
    return fail(
      'DATA_SOURCE=microcms には MICROCMS_SERVICE_DOMAIN と MICROCMS_API_KEY が必要です。',
    );
  }

  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(serviceDomain)) {
    return fail(
      'MICROCMS_SERVICE_DOMAIN は https:// や .microcms.io を除いたサービスIDを指定してください。',
    );
  }

  return { source: 'microcms', serviceDomain, apiKey };
}

function searchAliases(data: Record<string, unknown>, path: string): Pick<Thing, 'searchAliases'> {
  const entries = data.search_aliases ?? [];
  if (!Array.isArray(entries))
    throw new Error(`${path}.search_aliases は繰り返しフィールドである必要があります。`);
  const aliases = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const entryPath = `${path}.search_aliases[${index}]`;
    const alias = optionalText(record(entry, entryPath).value, `${entryPath}.value`);
    if (alias) aliases.add(alias);
  }
  return aliases.size ? { searchAliases: [...aliases] } : {};
}

function namedContents(
  input: unknown,
  endpoint: 'brands' | 'categories',
  fallbackName: string,
): Array<Brand | Category> {
  if (!Array.isArray(input)) return fail(`${endpoint} API はリスト形式で作成してください。`);
  const seen = new Set<string>();
  return input.map((entry, index) => {
    const path = `[picks] ${endpoint}[${index}]`;
    const data = record(entry, path);
    const id = requiredText(data.id, `${path}.id`);
    if (seen.has(id)) throw new Error(`${path}.id が重複しています。`);
    seen.add(id);
    return {
      id,
      name: optionalText(data.name, `${path}.name`) || fallbackName,
      ...(endpoint === 'brands' && searchAliases(data, path)),
    };
  });
}

export function validateBrands(input: unknown): Brand[] {
  return namedContents(input, 'brands', 'Unnamed brand');
}

export function validateCategories(input: unknown): Category[] {
  return namedContents(input, 'categories', 'Unnamed category');
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
    const path = `[picks] things[${index}]`;
    const data = record(entry, path);
    const id = requiredText(data.id, `${path}.id`);
    if (seen.has(id)) throw new Error(`${path}.id が重複しています。`);
    seen.add(id);
    const brandId = referenceId(data.ref_brand, `${path}.ref_brand`);
    const references = data.ref_categories ?? [];
    if (!Array.isArray(references))
      throw new Error(`${path}.ref_categories は複数コンテンツ参照である必要があります。`);
    const selectedCategories = new Map<string, Category>();
    for (const [referenceIndex, reference] of references.entries()) {
      const categoryId = referenceId(reference, `${path}.ref_categories[${referenceIndex}]`);
      const category = categoryId ? knownCategories.get(categoryId) : undefined;
      // Missing or unpublished references are optional; do not invent categories.
      if (category) selectedCategories.set(category.id, category);
    }
    const morePicks = data.more_picks ?? [];
    if (!Array.isArray(morePicks))
      throw new Error(`${path}.more_picks は複数コンテンツ参照である必要があります。`);
    const morePickIds = new Set<string>();
    for (const [referenceIndex, reference] of morePicks.entries()) {
      const pickId = referenceId(reference, `${path}.more_picks[${referenceIndex}]`);
      if (pickId && pickId !== id) morePickIds.add(pickId);
    }

    return {
      id,
      name: optionalText(data.name, `${path}.name`) || 'Unnamed item',
      variantLabel: optionalText(data.variant_label, `${path}.variant_label`) || undefined,
      ...searchAliases(data, path),
      brand: brandId ? (knownBrands.get(brandId) ?? null) : null,
      image:
        data.main_image == null
          ? null
          : validateImage(data.main_image, `${path}.main_image`, options.allowLocalImages ?? false),
      descriptionHtml: sanitizeDescription(optionalText(data.description, `${path}.description`)),
      categories: [...selectedCategories.values()],
      morePickIds: [...morePickIds],
    };
  });
}
