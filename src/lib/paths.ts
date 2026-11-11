export const collectionPath = '/picks';
export const thingPath = (id: string) => `${collectionPath}/things/${encodeURIComponent(id)}`;
export const categoryPath = (id: string) => `${collectionPath}?category=${encodeURIComponent(id)}#collection`;
