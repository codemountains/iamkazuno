import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { getNotes } from '../src/lib/notes';
import { validateNotes } from '../src/lib/notes-validation';

const credentials = { MICROCMS_SERVICE_DOMAIN: 'my-notes', MICROCMS_API_KEY: 'test-notes-key' };

function mockCMS(t: TestContext, notes: unknown[]) {
  const requests: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push(url);
    assert.equal(url.hostname, 'my-notes.microcms.io');
    assert.equal(url.pathname, '/api/v1/notes');
    const limit = Number(url.searchParams.get('limit') ?? 10);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    return Response.json({ contents: notes.slice(offset, offset + limit), totalCount: notes.length, limit, offset });
  });
  return requests;
}

async function loadNotesModule(t: TestContext, production: boolean) {
  await mkdir('.tmp', { recursive: true });
  const directory = await mkdtemp('.tmp/notes-test-');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'notes.mjs');
  const result = await build({
    entryPoints: ['src/lib/notes.ts'], bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false,
    define: {
      'import.meta.env.PROD': String(production),
      'import.meta.env.DATA_SOURCE': JSON.stringify('microcms'),
      'import.meta.env.MICROCMS_SERVICE_DOMAIN': JSON.stringify(credentials.MICROCMS_SERVICE_DOMAIN),
      'import.meta.env.MICROCMS_API_KEY': JSON.stringify(credentials.MICROCMS_API_KEY),
    },
  });
  await writeFile(file, result.outputFiles[0].text);
  return await import(pathToFileURL(file).href) as typeof import('../src/lib/notes');
}

test('notes tolerate optional fields and preserve an empty published collection', () => {
  assert.deepEqual(validateNotes([]), []);
  for (const note of validateNotes([{ id: 'absent', publishedAt: '2026-11-17T00:00:00Z' }, { id: 'null', title: ' ', note: null, publish_date: null }])) {
    assert.equal(note.title, '無題');
    assert.equal(note.bodyHtml, '');
    assert.equal(note.excerpt, '');
    assert.equal(note.publishedAt, null);
  }
});

test('notes sanitize rich text and create a readable, entity-decoded plain-text excerpt', () => {
  const [note] = validateNotes([{
    id: 'rich-text', title: ' 一つの記録 ',
    note: '<h1>考えたこと</h1><p>山と<strong>日常</strong> &amp; &lt;余白&gt;&nbsp;&#x1F3D4;</p><p>次の段落<br>続き。</p><script>secret()</script><a href="javascript:alert(1)">リンク</a>',
  }]);
  assert.equal(note.title, '一つの記録');
  assert.match(note.bodyHtml, /<h2>考えたこと<\/h2>/);
  assert.doesNotMatch(note.bodyHtml, /script|javascript|secret/);
  assert.equal(note.excerpt, '考えたこと 山と日常 & <余白> 🏔 次の段落 続き。 リンク');
  assert.equal(validateNotes([{ id: 'double-encoded', note: '<p>&amp;lt;still text&amp;gt;</p>' }])[0].excerpt, '&lt;still text&gt;');
});

test('excerpt truncation preserves complete graphemes and only adds ellipsis when needed', () => {
  const emoji = '👨‍👩‍👧‍👦';
  const [short, long] = validateNotes([
    { id: 'short', note: `<p>${emoji.repeat(140)}</p>` },
    { id: 'long', note: `<p>${emoji.repeat(141)}</p>` },
  ]);
  assert.equal(short.excerpt, emoji.repeat(140));
  assert.equal(long.excerpt, `${emoji.repeat(140)}…`);
});

test('publication order uses normalized instants, keeps ties stable, and puts undated notes last', () => {
  const notes = validateNotes([
    { id: 'undated' },
    { id: 'older', publish_date: '2026-11-16T23:30:00+09:00', publishedAt: '2026-11-18T00:00:00Z' },
    { id: 'newer', publish_date: '2026-11-16T22:30:00Z', publishedAt: '2026-11-17T00:00:00Z' },
    { id: 'same-time', publish_date: '2026-11-16T22:30:00Z' },
  ]);
  assert.deepEqual(notes.map((note) => note.id), ['newer', 'same-time', 'older', 'undated']);
  assert.equal(notes[2].publishedAt, '2026-11-16T14:30:00.000Z');
});

test('malformed API values, invalid dates and duplicate IDs fail with field context', () => {
  for (const input of [null, {}, 'notes']) assert.throws(() => validateNotes(input), /リスト/);
  assert.throws(() => validateNotes([null]), /notes\[0\]/);
  assert.throws(() => validateNotes([{}]), /id/);
  assert.throws(() => validateNotes([{ id: 'a' }, { id: 'a' }]), /重複/);
  assert.throws(() => validateNotes([{ id: 'a', title: 12 }]), /title/);
  assert.throws(() => validateNotes([{ id: 'a', note: {} }]), /note/);
  for (const publish_date of ['yesterday', '2026-11-17', '2026-02-30T00:00:00Z', '2026-13-10T00:00:00Z']) {
    assert.throws(() => validateNotes([{ id: 'a', publish_date }]), /publish_date/);
  }
});

test('explicit sample mode remains offline and identifies its content source', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => { throw new Error('Sample mode must not fetch'); });
  const content = await getNotes({ ...credentials, DATA_SOURCE: 'sample' });
  assert.equal(content.source, 'sample');
  assert.ok(content.notes.length > 0);
  assert.ok(content.notes.every((note) => note.id.startsWith('sample-')));
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('CMS loading fetches every page from notes in publication order without draft keys', async (t) => {
  const requests = mockCMS(t, Array.from({ length: 101 }, (_, index) => ({ id: `note-${index}` })));
  const content = await getNotes(credentials);
  assert.equal(content.source, 'microcms');
  assert.equal(content.notes.length, 101);
  assert.ok(requests.some((url) => Number(url.searchParams.get('offset')) > 0));
  assert.ok(requests.every((url) => url.searchParams.get('fields') === 'id,title,note,publish_date'));
  assert.ok(requests.every((url) => url.searchParams.get('orders') === '-publish_date'));
  assert.ok(requests.every((url) => !url.searchParams.has('draftKey')));
});

test('empty CMS results never receive sample content', async (t) => {
  mockCMS(t, []);
  assert.deepEqual(await getNotes(credentials), { notes: [], source: 'microcms' });
});

test('build route loads share a snapshot while dev and explicit loads see CMS updates', async (t) => {
  const notes = [{ id: 'one' }];
  const requests = mockCMS(t, notes);
  const production = await loadNotesModule(t, true);
  const [listing, detail] = await Promise.all([production.getNotes(), production.getNotes()]);
  assert.strictEqual(listing, detail);
  const initialRequests = requests.length;
  notes.push({ id: 'two' });
  assert.strictEqual(await production.getNotes(), listing);
  assert.equal(requests.length, initialRequests);
  assert.equal((await production.getNotes(credentials)).notes.length, 2);
  const development = await loadNotesModule(t, false);
  assert.equal((await development.getNotes()).notes.length, 2);
  notes.push({ id: 'three' });
  assert.equal((await development.getNotes()).notes.length, 3);
});

test('CMS failures hide credentials, never fall back, and can retry the build snapshot', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ message: credentials.MICROCMS_API_KEY }, { status: 403 }));
  const production = await loadNotesModule(t, true);
  await assert.rejects(production.getNotes(), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /notes API/);
    assert.match(error.message, /サンプルへの自動切り替えは行いません/);
    assert.ok(!error.message.includes(credentials.MICROCMS_API_KEY));
    return true;
  });
  t.mock.restoreAll();
  mockCMS(t, [{ id: 'recovered' }]);
  assert.equal((await production.getNotes()).notes[0].id, 'recovered');
});
