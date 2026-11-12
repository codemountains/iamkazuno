import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { Parser } from 'htmlparser2';

const javascriptTypes = new Set(['', 'text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript']);

/** Create one cache per build: common initializers occur on every page. */
export function createInlineScriptMinifier() {
  /** @type {Map<string, string>} */
  const cache = new Map();

  /** @param {string} html */
  return async (html) => {
    /** @type {Array<{ start: number, end: number }>} */
    const scripts = [];
    /** @type {number | undefined} */
    let start;
    const parser = new Parser({
      onopentag(name, attributes) {
        if (name !== 'script') return;
        // Astro already bundles modules. JSON, import maps and external scripts stay untouched.
        const type = (attributes.type ?? '').trim().toLowerCase();
        start = !Object.hasOwn(attributes, 'src') && javascriptTypes.has(type)
          ? parser.endIndex + 1
          : undefined;
      },
      onclosetag(name, implied) {
        if (name !== 'script') return;
        if (start !== undefined && !implied) scripts.push({ start, end: parser.startIndex });
        start = undefined;
      },
    });
    parser.end(html);

    const parts = [];
    let previous = 0;
    for (const script of scripts) {
      const original = html.slice(script.start, script.end);
      let minified = cache.get(original);
      if (minified === undefined) {
        const result = await transform(original, {
          loader: 'js',
          minify: true,
          target: 'es2020',
          charset: 'utf8',
          // Keep Astro's escaped serialized values safe inside an HTML script element.
          supported: { 'inline-script': true },
        });
        const code = result.code.trimEnd();
        // Minification can turn \u003C!-- back into <!--. Keep the original in that
        // case so serialized content cannot enter HTML's escaped script tokenizer state.
        minified = code.includes('<!--') || Buffer.byteLength(code) >= Buffer.byteLength(original)
          ? original
          : code;
        cache.set(original, minified);
      }
      parts.push(html.slice(previous, script.start), minified);
      previous = script.end;
    }
    return parts.join('') + html.slice(previous);
  };
}

/** @returns {import('astro').AstroIntegration} */
export default function minifyInlineScripts() {
  return {
    name: 'minify-inline-scripts',
    hooks: {
      'astro:build:generated': async ({ dir }) => {
        const minify = createInlineScriptMinifier();
        /** @param {string} directory */
        async function visit(directory) {
          for (const entry of await readdir(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) {
              await visit(path);
            } else if (entry.isFile() && entry.name.endsWith('.html')) {
              const original = await readFile(path, 'utf8');
              const minified = await minify(original);
              if (minified !== original) await writeFile(path, minified);
            }
          }
        }
        await visit(fileURLToPath(dir));
      },
    },
  };
}
