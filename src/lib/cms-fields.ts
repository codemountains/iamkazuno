import type { ContentImage } from '../types/content';

export function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} はオブジェクトである必要があります。`);
  }
  return value as Record<string, unknown>;
}

export function requiredText(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${path} に空でないテキストを設定してください。`);
  }
  return value.trim();
}

export function optionalText(value: unknown, path: string): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Error(`${path} はテキストである必要があります。`);
  return value.trim();
}

function httpUrl(value: unknown, path: string): string {
  const text = requiredText(value, path);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${path} に完全な HTTP または HTTPS URL を設定してください。`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${path} は認証情報を含まない HTTP または HTTPS URL を指定してください。`);
  }
  return url.href;
}

export function validateImage(value: unknown, path: string, allowLocalImages: boolean): ContentImage {
  const input = record(value, path);
  const rawUrl = requiredText(input.url, `${path}.url`);
  const url = allowLocalImages && /^\/(?:[\w-]+\/)*[\w-]+\.(?:svg|png|jpe?g|webp|avif)$/i.test(rawUrl)
    ? rawUrl
    : httpUrl(rawUrl, `${path}.url`);

  for (const key of ['width', 'height'] as const) {
    if (typeof input[key] !== 'number' || !Number.isSafeInteger(input[key]) || input[key] <= 0) {
      throw new Error(`${path}.${key} は正の整数である必要があります。`);
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
