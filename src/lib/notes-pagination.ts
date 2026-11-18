import type { Note } from '../types/notes';

export const NOTES_PER_PAGE = 10;

export interface NotesPage {
  notes: Note[];
  currentPage: number;
  totalPages: number;
  totalNotes: number;
}

export function paginateNotes(notes: Note[]): NotesPage[] {
  const totalNotes = notes.length;
  const totalPages = Math.max(1, Math.ceil(totalNotes / NOTES_PER_PAGE));
  return Array.from({ length: totalPages }, (_, index) => {
    const start = index * NOTES_PER_PAGE;
    return {
      notes: notes.slice(start, start + NOTES_PER_PAGE),
      currentPage: index + 1,
      totalPages,
      totalNotes,
    };
  });
}
