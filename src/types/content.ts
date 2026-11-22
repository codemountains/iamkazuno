export interface Category {
  id: string;
  name: string;
}

export interface Brand {
  id: string;
  name: string;
  searchAliases?: string[];
}

export interface ContentImage {
  url: string;
  width: number;
  height: number;
  alt?: string;
}

export type PickImage = ContentImage;

// Display models: normalized from either the CMS responses or the sample fixtures.
export interface Thing {
  id: string;
  name: string;
  searchAliases?: string[];
  brand: Brand | null;
  image: PickImage | null;
  descriptionHtml: string;
  categories: Category[];
  morePickIds: string[];
}

export interface Content {
  things: Thing[];
  brands: Brand[];
  categories: Category[];
  source: 'sample' | 'microcms';
}

export interface MicroCMSNamedContent {
  id: string;
  name?: string | null;
}

interface MicroCMSSearchAlias {
  fieldId: 'search_alias';
  value: string;
}

export interface MicroCMSBrand extends MicroCMSNamedContent {
  search_aliases?: MicroCMSSearchAlias[] | null;
}

export interface MicroCMSThing {
  id: string;
  name?: string | null;
  search_aliases?: MicroCMSSearchAlias[] | null;
  description?: string | null;
  main_image?: PickImage | null;
  ref_brand?: { id: string } | null;
  ref_categories?: Array<{ id: string } | null> | null;
  more_picks?: Array<{ id: string } | null> | null;
}

export interface ContentEnvironment {
  DATA_SOURCE?: string;
  MICROCMS_SERVICE_DOMAIN?: string;
  MICROCMS_API_KEY?: string;
}

export type ContentConfiguration =
  { source: 'sample' } | { source: 'microcms'; serviceDomain: string; apiKey: string };
