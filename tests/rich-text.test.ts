import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeDescription } from '../src/lib/rich-text';

test('rich descriptions retain semantic formatting without creating a second page h1', () => {
  const result = sanitizeDescription('<h1>使い心地</h1><p><strong>軽い</strong>道具。<em>毎日</em>使う。</p><ul><li>持ち運べる</li></ul><blockquote>小さくても十分。</blockquote><pre><code>&lt;example&gt;</code></pre><table><tbody><tr><th scope="row">重さ</th><td>100 g</td></tr></tbody></table>');
  assert.ok(result.startsWith('<h2>使い心地</h2>'));
  assert.ok(result.includes('<strong>軽い</strong>'));
  assert.ok(result.includes('<ul><li>持ち運べる</li></ul>'));
  assert.ok(result.includes('<blockquote>小さくても十分。</blockquote>'));
  assert.ok(result.includes('<code>&lt;example&gt;</code>'));
  assert.ok(result.includes('<th scope="row">重さ</th>'));
});

test('scripts, embeds, foreign markup and arbitrary styling never survive', () => {
  const result = sanitizeDescription('<script>alert(1)</script><style>body{display:none}</style><iframe src="https://example.com"><p>embedded</p></iframe><svg><a href="https://example.com">svg text</a></svg><p id="main" class="hidden" style="color:red" onclick="alert(1)">説明</p><img src="https://example.com/image.png" onerror="alert(1)" />');
  assert.equal(result, '<p>説明</p><img loading="lazy" decoding="async" src="https://example.com/image.png" />');
});

test('unsafe and obfuscated URLs are removed while their link labels remain', () => {
  for (const href of ['javascript:alert(1)', 'jav&#x61;script:alert(1)', 'java&#10;script:alert(1)', 'data:text/html,hello', '//example.com/path', '/\\example.com/path', 'https://user:secret@example.com']) {
    assert.equal(sanitizeDescription(`<p><a href="${href}">説明</a></p>`), '<p>説明</p>');
    assert.equal(sanitizeDescription(`<img src="${href}" alt="image" />`), '');
  }
});

test('safe links and images keep useful attributes and blank targets get isolation', () => {
  const result = sanitizeDescription('<a href="https://example.com/item?a=1&amp;b=2" target="_blank" rel="opener">商品</a><a href="/things/camera/">カメラ</a><a href="#main">先頭</a><a href="mailto:hello@example.com">連絡</a><img src="/images/samples/camera.svg" alt="カメラ" width="640" height="-5" />');
  assert.ok(result.includes('href="https://example.com/item?a=1&amp;b=2" target="_blank" rel="noopener noreferrer"'));
  assert.ok(result.includes('href="/things/camera/"'));
  assert.ok(result.includes('href="#main"'));
  assert.ok(result.includes('href="mailto:hello@example.com"'));
  assert.ok(result.includes('src="/images/samples/camera.svg" alt="カメラ" width="640"'));
  assert.ok(!result.includes('height='));
});

test('empty editor output normalizes to empty; text and image-only descriptions remain', () => {
  for (const input of ['', '  ', '<p><br /></p>', '<p>&nbsp;</p>', '<p>&#x200b;</p>', '<div><p> </p></div>']) {
    assert.equal(sanitizeDescription(input), '');
  }
  assert.equal(sanitizeDescription('道具 & 暮らし'), '道具 &amp; 暮らし');
  assert.ok(sanitizeDescription('<p><img src="https://example.com/image.jpg" /></p>').includes('<img '));
});
