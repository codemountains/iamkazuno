import type { APIRoute, GetStaticPaths } from 'astro';
import { getContent } from '../../lib/content';
import { buildPicksSearch } from '../../lib/picks-search-index';

export const getStaticPaths = (async () => {
  const { things } = await getContent();
  const files = await buildPicksSearch(things);
  return files.map(({ path, content }) => ({
    params: { asset: path },
    props: { content },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params, props }) => {
  const extension = params.asset?.split('.').pop() ?? '';
  const contentTypes: Record<string, string> = {
    js: 'text/javascript',
    json: 'application/json',
    css: 'text/css',
  };
  return new Response(props.content, {
    headers: { 'Content-Type': contentTypes[extension] ?? 'application/octet-stream' },
  });
};
