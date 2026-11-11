# OG画像生成プロンプト

生成前に `{{product_count}}` と `{{image_source_mapping}}` を実際の素材に置き換える。商品数は入力ファイル数ではなく、素材シートに含めた商品も数える。

対応表は単体画像なら `Image 1 = 商品名と見た目の特徴`、素材シートなら `Image 1, row 1, column 1 = 商品名と見た目の特徴` の形式で記述する。商品名・件数・シート内の位置を固定しない。

下記のサイズや行列数は1200×630pxでの初期目安。商品数が増えたら、判別できる範囲で画像を小さくし、画面内の種類数を増やす。全商品の全体表示や固定の安全余白を条件に追加しない。

```text
Use case: product-image compositing for an Open Graph website asset.
Create a finished 1200 x 630 px wide landscape PNG for the personal collection website /picks.

Visual direction: inspired by the OG image at unvalley.me/things: a dense wall of small isolated product photographs in a regular diagonal grid that extends beyond every edge, on pale light gray, with no added typography. Prioritize showing as many distinct supplied products as possible over making individual products large or fully visible.

The attached source images or contact sheets contain {{product_count}} distinct product sources. These are the ONLY PRODUCT SOURCES. Preserve their silhouettes, proportions, materials, colors, printed graphics and identity. Treat them as cutout photographic assets to arrange, not objects to redesign. Contact sheets are input packaging only: use the individual products, not their panels, captions, numbers, or sheet arrangement.
{{image_source_mapping}}

Composition: a continuous full-bleed inventory wall. Start with roughly 10–12 columns and 7–9 rows, rotate the entire arrangement approximately 10–12 degrees counterclockwise so rows rise toward the right, and crop it to fill the canvas edge-to-edge. Adapt the row and column counts to the number and shapes of the products; there is no fixed item-count limit. The grid continues beyond the canvas. Products at the edges may be naturally cropped, and every product does NOT need a fully visible copy. Do not add a large safe margin or shrink the entire grid to fit every item within the canvas.

Keep the individual products small: approximately 60–90 px footprints within 90–115 px grid spacing at the final 1200 px width is an initial guide. Adjust the scale and density so as many different products as possible remain recognizable. Preserve aspect ratios and avoid overlap. Do not make the objects so tiny they lose their identity.

Aim to include all available sources. Prioritize previously unused products over repetitions; do not fill the wall with repeated copies of a small selected subset. When repeats are needed to fill the frame, spread them evenly and avoid adjacent duplicates where possible. Balance vivid colors throughout the quieter neutral-colored objects. Keep paired or grouped products together as supplied.

Scene/backdrop: completely flat opaque very light warm gray #f0f0ee; clean editorial catalog feel.
Style: crisp photographic cutouts, natural product colors, uniform delicate lighting, no exaggerated cast shadows. Flat 2D arrangement, not a perspective room, no floor horizon.
Text: NO added title, NO /picks lettering, NO subtitle, NO labels, NO captions, NO sheet numbers, NO watermark. Existing text printed on the supplied products stays on those products only.
Constraints: use only the supplied product types. Do not invent additional objects, people, scenery, cards, frames, borders, gradients, decorative marks or background textures. Never mirror product text. Deliver a polished full-bleed OG image in 1200:630 aspect ratio, with small products and maximum useful variety.
```
