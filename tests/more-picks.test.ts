import assert from 'node:assert/strict';
import test from 'node:test';
import { validateThings } from '../src/lib/content-validation';
import { getMorePicks } from '../src/lib/more-picks';

test('CMS references preserve selection order and resolve current published data', () => {
  const things = validateThings(
    [
      {
        id: 'current',
        more_picks: [
          { id: 'second', name: 'Old embedded name', more_picks: [{ id: 'current' }] },
          null,
          { id: 'current' },
          { id: 'first' },
          { id: 'second' },
          { id: 'unpublished' },
        ],
      },
      { id: 'first', name: 'First' },
      { id: 'second', name: 'Second', more_picks: [{ id: 'current' }] },
    ],
    [],
    [],
  );
  assert.deepEqual(things[0].morePickIds, ['second', 'first', 'unpublished']);
  assert.deepEqual(getMorePicks(things[0], things), [things[2], things[1]]);
  assert.deepEqual(getMorePicks(things[2], things), [things[0]]);
});

test('all selected items are returned without a fixed count limit', () => {
  const references = Array.from({ length: 12 }, (_, index) => ({ id: `pick-${index}` }));
  const things = validateThings(
    [{ id: 'current', more_picks: references }, ...references.toReversed()],
    [],
    [],
  );
  assert.deepEqual(
    getMorePicks(things[0], things).map((thing) => thing.id),
    references.map((reference) => reference.id),
  );
});

test('missing selections remain empty even when matching categories exist', () => {
  const category = { id: 'mountain', name: 'mountain' };
  const things = validateThings(
    [
      { id: 'current', ref_categories: [category] },
      { id: 'other', ref_categories: [category] },
      { id: 'null', more_picks: null },
      { id: 'empty', more_picks: [] },
      { id: 'unavailable', more_picks: [null, { id: 'unpublished' }] },
    ],
    [],
    [category],
  );
  for (const thing of things) assert.deepEqual(getMorePicks(thing, things), []);
});

test('selection resolution excludes self and duplicate references without mutating the input', () => {
  const things = validateThings([{ id: 'current' }, { id: 'other' }], [], []);
  const current = { ...things[0], morePickIds: ['current', 'other', 'other', 'missing'] };
  assert.deepEqual(getMorePicks(current, things), [things[1]]);
  assert.deepEqual(current.morePickIds, ['current', 'other', 'other', 'missing']);
});
