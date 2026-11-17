---
name: generate-og
description: iamkaz.uno・iamkaz.uno/notes・iamkaz.uno/picks の、無地の背景にワードマークを中央配置したOG 画像を生成・更新する。og-home.png、og-notes.png、og-picks.png の作成・再生成や、同じテイストの文字中心の OG 画像を依頼されたときに使う。
---

# OG 画像生成

リポジトリルートで [scripts/generate.mjs](scripts/generate.mjs) を実行する。既存の Playwright・Chromium・sharp と DM Mono を使い、ライトモードの配色を `src/styles/global.css` から読み込む。

```sh
node .agents/skills/generate-og/scripts/generate.mjs home
node .agents/skills/generate-og/scripts/generate.mjs notes
node .agents/skills/generate-og/scripts/generate.mjs picks
```

依頼された対象だけを実行する。描画する文言と出力先は次のとおり。末尾にピリオドは付けない。notes のトップと各ノートは同じ画像を使う。

| 対象 | 文言 | 出力先 |
| --- | --- | --- |
| `home` | `iamkaz.uno` | `public/og-home.png` |
| `notes` | `iamkaz.uno/notes` | `public/og-notes.png` |
| `picks` | `iamkaz.uno/picks` | `public/og-picks.png` |

プレビューのみの場合は第2引数で `.tmp/` 内の出力先を指定する。

```sh
node .agents/skills/generate-og/scripts/generate.mjs notes .tmp/og/notes-preview.png
```

- 既定は 1200 × 630px の不透明 PNG。余白を広く取り、ワードマークだけを中央に置く。背景・文字・アクセントはサイトのライトモードに合わせる。ドメインの `.` とパスの `/` をアクセント色にする。picks も notes と同じ仕様で、商品画像は使わない。
- 文言・サイズ・配置などの変更指定があれば、スクリプトのプリセットや描画スタイルを調整する。
- Chromium が未導入なら `docs/development.md` のブラウザ準備を参照する。
- 出力画像を開き、表記、中央配置、色、文字切れがないことを確認する。再生成では既存画像とも比較する。スクリプトの出力で画像サイズを確認し、完成画像と保存先を報告する。
- ページへの OG 設定追加も依頼された場合は対象ページの `BaseLayout` の `image`・`imageAlt` を設定する。生成だけの依頼でコミットやデプロイは行わない。
