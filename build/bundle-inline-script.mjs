import { build } from 'esbuild';

/** Bundle shared browser logic without adding a network dependency before first paint.
 * @param {string} entryPoint Project-relative browser entry point.
 */
export async function bundleInlineScript(entryPoint) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    charset: 'utf8',
    supported: { 'inline-script': true },
  });
  return result.outputFiles[0].text;
}
