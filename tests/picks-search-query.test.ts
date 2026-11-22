import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSearchQuery } from '../src/lib/picks-search';

test('English models and kana normalize consistently in a mixed search', () => {
  for (const input of ['  Ｘ－Ｍｉｄ　かめら ', 'X‐Mid ｶﾒﾗ', 'XMid カメラ', 'x mid カメラ']) {
    assert.equal(normalizeSearchQuery(input), 'x mid カメラ');
  }
  assert.equal(normalizeSearchQuery('ｺｰﾋｰ　サーバー'), 'コーヒー サーバー');
  assert.equal(normalizeSearchQuery('ぶーつ'), normalizeSearchQuery('ブーツ'));
  assert.equal(normalizeSearchQuery('　\n'), '');
});
