import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getNotes, notesDescription, notesTitle } from '../../lib/notes';
import { notePath, notesPath } from '../../lib/paths';

export const GET: APIRoute = async ({ site }) => {
  const { notes } = await getNotes();

  return rss({
    title: notesTitle,
    description: notesDescription,
    site: new URL(notesPath, site),
    trailingSlash: false,
    customData: '<language>ja</language>',
    items: notes.map(({ id, title, excerpt, publishedAt }) => ({
      title,
      description: excerpt,
      link: notePath(id),
      pubDate: publishedAt ? new Date(publishedAt) : undefined,
    })),
  });
};
