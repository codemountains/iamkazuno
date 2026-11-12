import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pruneSampleImages } from '../build/optimize-static-assets.mjs';

test('sample builds keep referenced illustrations, including rich text and absolute URLs', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'picks-assets-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const samples = join(directory, 'images/samples');
  await mkdir(samples, { recursive: true });
  await mkdir(join(directory, 'picks/things/example'), { recursive: true });
  for (const name of ['boots.svg', 'camera.svg', 'unused.svg']) await writeFile(join(samples, name), '<svg/>');
  await writeFile(join(directory, 'favicon.svg'), '<svg/>');
  await writeFile(join(directory, '_redirects'), '/old /new 301');
  await writeFile(join(directory, 'picks/index.html'), '<img src="/images/samples/boots.svg">');
  await writeFile(join(directory, 'picks/things/example/index.html'), '<p><img src="https://iamkaz.uno/images/samples/camera.svg"></p>');

  await pruneSampleImages(directory);

  assert.deepEqual((await readdir(samples)).sort(), ['boots.svg', 'camera.svg']);
  assert.equal(await readFile(join(directory, 'favicon.svg'), 'utf8'), '<svg/>');
  assert.equal(await readFile(join(directory, '_redirects'), 'utf8'), '/old /new 301');
});

test('CMS builds omit unreferenced samples and builds without a sample directory work', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'picks-assets-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'index.html'), '<img src="https://images.microcms-assets.io/product.png">');
  await pruneSampleImages(directory);
  const samples = join(directory, 'images/samples');
  await mkdir(samples, { recursive: true });
  await writeFile(join(samples, 'boots.svg'), '<svg/>');
  await pruneSampleImages(directory);
  assert.deepEqual(await readdir(samples), []);
});
