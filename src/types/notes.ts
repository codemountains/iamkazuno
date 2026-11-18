import type { ContentImage } from './content';

export interface NotePhotoSection {
  title: string;
  photos: ContentImage[];
}

export interface Note {
  id: string;
  title: string;
  bodyHtml: string;
  excerpt: string;
  publishedAt: string | null;
  photoSection: NotePhotoSection | null;
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
  publishedAt?: string | null;
  note_photo?: {
    fieldId: 'photo_section';
    photo_title?: string | null;
    photo_list?: ContentImage[] | null;
  } | null;
}
