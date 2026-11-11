export interface Category {
  id: string;
  name: string;
}

export interface Brand {
  id: string;
  name: string;
}

export interface PickImage {
  url: string;
  width: number;
  height: number;
  alt?: string;
}

// Display models: normalized from either the CMS responses or the sample fixtures.
export interface Thing {
  id: string;
  name: string;
  brand: Brand | null;
  image: PickImage | null;
  descriptionHtml: string;
  categories: Category[];
}

export interface Content {
  things: Thing[];
  brands: Brand[];
  categories: Category[];
  source: 'sample' | 'microcms';
}

// The custom fields in the configured microCMS schemas are all optional.
export interface MicroCMSNamedContent {
  id: string;
  name?: string | null;
}

export interface MicroCMSThing {
  id: string;
  name?: string | null;
  description?: string | null;
  main_image?: PickImage | null;
  ref_brand?: { id: string } | null;
  ref_categories?: Array<{ id: string } | null> | null;
}

export interface ContentEnvironment {
  DATA_SOURCE?: string;
  MICROCMS_SERVICE_DOMAIN?: string;
  MICROCMS_API_KEY?: string;
}

export type ContentConfiguration =
  | { source: 'sample' }
  | { source: 'microcms'; serviceDomain: string; apiKey: string };
