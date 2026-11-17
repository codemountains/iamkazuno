export interface Note {
  id: string;
  title: string;
  bodyHtml: string;
  excerpt: string;
  publishedAt: string | null;
}

export interface NotesContent {
  notes: Note[];
  source: 'sample' | 'microcms';
}

// Older entries may not have values for all fields.
export interface MicroCMSNote {
  id: string;
  title?: string | null;
  note?: string | null;
  publish_date?: string | null;
}
