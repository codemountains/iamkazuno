// Build-time only: import from Astro frontmatter, never a client script.
import { createClient } from 'microcms-js-sdk';
import { sampleNotes } from '../data/sample-notes';
import type { ContentEnvironment } from '../types/content';
import type { NotesContent } from '../types/notes';
import { resolveContentConfiguration } from './content-validation';
import { validateNotes } from './notes-validation';

let buildNotes: Promise<NotesContent> | undefined;

export async function getNotes(env?: ContentEnvironment): Promise<NotesContent> {
  if (env) return loadNotes(env);
  const environment = {
    DATA_SOURCE: import.meta.env.DATA_SOURCE,
    MICROCMS_SERVICE_DOMAIN: import.meta.env.MICROCMS_SERVICE_DOMAIN,
    MICROCMS_API_KEY: import.meta.env.MICROCMS_API_KEY,
  };
  if (!import.meta.env.PROD) return loadNotes(environment);
  buildNotes ??= loadNotes(environment).catch((error) => {
    buildNotes = undefined;
    throw error;
  });
  return buildNotes;
}

async function loadNotes(env: ContentEnvironment): Promise<NotesContent> {
  const config = resolveContentConfiguration(env);
  if (config.source === 'sample') {
    return { notes: validateNotes(sampleNotes, { allowLocalImages: true }), source: 'sample' };
  }

  const client = createClient({ serviceDomain: config.serviceDomain, apiKey: config.apiKey });
  let rawNotes: unknown;
  try {
    rawNotes = await client.getAllContents({
      endpoint: 'notes',
      queries: { fields: 'id,title,note,publishedAt,note_photo', orders: '-publishedAt' },
    });
  } catch {
    throw new Error(
      '[notes] microCMSの取得に失敗しました。接続情報、APIキーのGET権限、notes API、通信状態を確認してください。サンプルへの自動切り替えは行いません。',
    );
  }
  return { notes: validateNotes(rawNotes), source: 'microcms' };
}
