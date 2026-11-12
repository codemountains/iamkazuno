import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/** Keep sample illustrations only when a generated page actually references them.
 * @param {string} directory
 */
export async function pruneSampleImages(directory) {
  const sampleDirectory = join(directory, 'images/samples');
  let samples;
  try {
    samples = await readdir(sampleDirectory, { withFileTypes: true });
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return;
    throw error;
  }
  const pages = (await readdir(directory, { recursive: true })).filter((path) => path.endsWith('.html'));
  const html = (await Promise.all(pages.map((path) => readFile(join(directory, path), 'utf8')))).join('\n');
  for (const sample of samples) {
    if (!sample.isFile() || !sample.name.endsWith('.svg')) continue;
    if (!html.includes(`/images/samples/${sample.name}`)) {
      await rm(join(sampleDirectory, sample.name));
    }
  }
}

/** @returns {import('astro').AstroIntegration} */
export default function optimizeStaticAssets() {
  return {
    name: 'optimize-static-assets',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const directory = fileURLToPath(dir);
        // Keep the editable PNGs in public/; only the deployable copies are replaced.
        const picks = join(directory, 'og-picks.png');
        await sharp(picks)
          .flatten({ background: '#f8f7f3' })
          .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' })
          .toFile(join(directory, 'og-picks.jpg'));
        await rm(picks);

        // Text-heavy artwork stays lossless PNG.
        const home = join(directory, 'og-home.png');
        const original = await readFile(home);
        const optimized = await sharp(original).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
        if (optimized.length < original.length) await writeFile(home, optimized);

        await pruneSampleImages(directory);
      },
    },
  };
}
