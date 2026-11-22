// Pagefind 1.6.0 drops chunk errors and starts initialization in a detached
// promise. Surface both failures through search() so Picks can offer a retry.
// https://github.com/Pagefind/pagefind/blob/v1.6.0/pagefind_web_js/lib/coupled_search.ts#L374-L381
export function preparePagefindModule(content: Uint8Array): Uint8Array<ArrayBuffer> {
  const source = new TextDecoder().decode(content);
  const load = '"load_index_chunk"))';
  const swallowed = load + '.catch(()=>{})';
  const init = 'this.init(options2?.language)';
  if (!source.includes(swallowed) || !source.includes(init + ';')) {
    throw new Error('Review Pagefind error handling before building the search module.');
  }
  // init() already stores the error for getPtr(), which rejects the search.
  const module = source.replace(swallowed, load).replace(init + ';', init + '.catch(()=>{});');
  return new TextEncoder().encode(module);
}
