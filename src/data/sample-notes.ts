import type { MicroCMSNote } from '../types/notes';

// Offline development fixtures; never substituted for missing or failed CMS content.
export const sampleNotes: MicroCMSNote[] = [
  {
    id: 'sample-note',
    title: '言葉を置いておく場所',
    publish_date: '2026-11-16T15:00:00.000Z',
    note: '<p>これは表示を確認するためのサンプルノートです。</p><p>日常の小さな気づきや、いつもと違う日のこと。考えがまとまる前でも、言葉にして残しておく。</p><h2>書きながら、考える</h2><p>すぐに答えを出さず、<strong>いま考えていること</strong>を少しずつ書く。後から読み返すと、別の見え方があるかもしれません。</p><blockquote><p>とりとめのないことにも、書き留める場所を。</p></blockquote><p>段落、見出し、引用、そして<a href="/picks">お気に入りのもの</a>へのリンク。文章の余白と読み心地を確認できます。</p><h2>表示の確認</h2><p>長いコードや表は、文章の幅を保ったまま横にスクロールできます。</p><pre><code>const note = { title: "言葉を置いておく場所", description: "日常や非日常の振り返り、考えたことを少しずつ書き留めるためのサンプルです。" };</code></pre><table><thead><tr><th>きっかけ</th><th>書き留めること</th><th>読み返すとき</th></tr></thead><tbody><tr><td>日常の小さな気づき</td><td>そのとき感じたことや考えたこと</td><td>考えの変化を眺める</td></tr><tr><td>いつもと違う一日</td><td>忘れずにおきたい景色と言葉</td><td>その日の空気を思い出す</td></tr></tbody></table>',
  },
];
