import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Parser } from 'htmlparser2';

const scriptTypes = new Set([
  '',
  'module',
  'importmap',
  'speculationrules',
  'text/javascript',
  'application/javascript',
  'text/ecmascript',
  'application/ecmascript',
]);

/** @param {Iterable<string>} pages */
export function createContentSecurityPolicy(pages, { allowWasm = false } = {}) {
  /** @type {Set<string>} */
  const scripts = new Set();
  /** @type {Set<string>} */
  const styles = new Set();

  for (const html of pages) {
    /** @type {{ name: string, start: number } | undefined} */
    let block;
    const parser = new Parser({
      onopentag(name, attributes) {
        if (
          name === 'style' ||
          (name === 'script' &&
            !Object.hasOwn(attributes, 'src') &&
            scriptTypes.has((attributes.type ?? '').trim().toLowerCase()))
        ) {
          block = { name, start: parser.endIndex + 1 };
        }
      },
      onclosetag(name, implied) {
        if (!block || block.name !== name) return;
        if (!implied) {
          // HTML parsing normalizes line endings before CSP hashes are checked.
          const content = html.slice(block.start, parser.startIndex).replace(/\r\n?/g, '\n');
          if (content.trim()) {
            const hash = `'sha256-${createHash('sha256').update(content, 'utf8').digest('base64')}'`;
            (name === 'script' ? scripts : styles).add(hash);
          }
        }
        block = undefined;
      },
    });
    parser.end(html);
  }

  // A shared policy keeps the number of Cloudflare header rules independent of the item count.
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    [
      "script-src 'self' https://static.cloudflareinsights.com",
      ...(allowWasm ? ["'wasm-unsafe-eval'"] : []),
      ...[...scripts].sort(),
    ].join(' '),
    "script-src-attr 'none'",
    ["style-src 'self'", ...[...styles].sort()].join(' '),
    "style-src-attr 'none'",
    "img-src 'self' data: https://images.microcms-assets.io",
    "font-src 'self'",
    "connect-src 'self' https://cloudflareinsights.com",
    "worker-src 'none'",
  ].join('; ');
}

/** @param {string} directory */
export async function writeContentSecurityPolicy(directory) {
  const paths = (await readdir(directory, { recursive: true }))
    .filter((path) => path.endsWith('.html'))
    .sort();
  if (!paths.length) throw new Error('CSP generation requires the final built HTML.');
  const pages = await Promise.all(paths.map((path) => readFile(join(directory, path), 'utf8')));
  const globalLine = `  Content-Security-Policy: ${createContentSecurityPolicy(pages)}`;
  const collectionIndex = paths.indexOf(join('picks', 'index.html'));
  const picksLine =
    collectionIndex === -1
      ? ''
      : `  Content-Security-Policy: ${createContentSecurityPolicy([pages[collectionIndex]], { allowWasm: true })}`;
  // Cloudflare ignores invalid _headers lines; fail the build instead of deploying without CSP.
  // https://developers.cloudflare.com/workers/static-assets/headers/
  const longestLine = Math.max(globalLine.length, picksLine.length);
  if (longestLine > 2000) {
    throw new Error(
      `CSP exceeds Cloudflare's 2,000-character header line limit (${longestLine}). Externalize inline code before adding more hashes.`,
    );
  }

  const path = join(directory, '_headers');
  const headers = await readFile(path, 'utf8');
  if (/^\s*Content-Security-Policy(?:-Report-Only)?:/im.test(headers)) {
    throw new Error(
      'CSP must be generated once from the final HTML, not also defined in public/_headers.',
    );
  }
  const lines = headers.trimEnd().split(/\r?\n/);
  // Pagefind uses Wasm only in the collection. Detach the inherited policy before
  // attaching its page-specific replacement, so browsers enforce a single CSP.
  if (picksLine) {
    if (!lines.includes('/picks')) lines.push('', '/picks');
    lines.splice(lines.indexOf('/picks') + 1, 0, '  ! Content-Security-Policy', picksLine);
  }
  const rules = lines.filter((line) => /^(?:\/|https:\/\/)/.test(line));
  if (rules.length > 100) throw new Error("Cloudflare's 100 header rule limit is exceeded.");
  if (rules.filter((rule) => rule.trim() === '/*').length !== 1) {
    throw new Error('CSP generation requires exactly one /* rule in public/_headers.');
  }
  // Duplicate path blocks overwrite each other in Cloudflare: extend the existing global rule.
  lines.splice(lines.findIndex((line) => line.trim() === '/*') + 1, 0, globalLine);
  await writeFile(path, `${lines.join('\n')}\n`);
}

/** @returns {import('astro').AstroIntegration} */
export default function contentSecurityPolicy() {
  return {
    name: 'content-security-policy',
    hooks: {
      // Run after minify-inline-scripts and any other HTML transformations.
      'astro:build:done': async ({ dir }) => {
        await writeContentSecurityPolicy(fileURLToPath(dir));
      },
    },
  };
}
