export const collectionPath = '/picks';
export const thingPath = (id: string) => `${collectionPath}/things/${encodeURIComponent(id)}`;
export const categoryPath = (id: string) => `${collectionPath}?category=${encodeURIComponent(id)}`;
export const notesPath = '/notes';
export const notesFeedPath = `${notesPath}/rss.xml`;
export const notesPagePath = (page: number) =>
  page === 1 ? notesPath : `${notesPath}/page/${page}`;
export const notePath = (id: string) => `${notesPath}/${encodeURIComponent(id)}`;
