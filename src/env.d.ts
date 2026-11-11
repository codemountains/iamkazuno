/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly DATA_SOURCE?: 'auto' | 'sample' | 'microcms';
  readonly MICROCMS_SERVICE_DOMAIN?: string;
  readonly MICROCMS_API_KEY?: string;
  readonly SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
