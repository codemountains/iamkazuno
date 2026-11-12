# OG画像生成プロンプト

生成前に `{{product_count}}` と `{{image_source_mapping}}` を実際の素材に置き換える。商品数は入力ファイル数ではなく、素材シートに含めた商品も数える。

対応表は単体画像なら `Image 1 = 商品名と見た目の特徴`、素材シートなら `Image 1, row 1, column 1 = 商品名と見た目の特徴` の形式で記述する。商品名・件数・シート内の位置を固定しない。

下記のサイズや行列数は1200×630pxでの初期目安。商品数が増えたら、商品間の余白と判別しやすさを保ちながら、構図に合う素材を選ぶ。全件掲載を求められた場合は、その条件をプロンプトに加える。

```text
Use case: product-image compositing for an Open Graph website asset.
Create a finished 1200 x 630 px wide landscape PNG for the personal collection website /picks.

Visual direction: inspired by the OG image at unvalley.me/things. Small isolated product photographs fill a regular diagonal grid that extends beyond every edge, on the site's warm off-white light-mode background. Give neighboring objects a little breathing room and place a large /picks. wordmark in the lower-right. Show a broad variety of supplied products while preserving the visible gaps between them.

The attached source images or contact sheets contain {{product_count}} distinct product sources. These are the ONLY PRODUCT SOURCES. Preserve their silhouettes, proportions, materials, colors, printed graphics and identity. Treat them as cutout photographic assets to arrange, not objects to redesign. Contact sheets are input packaging only: use the individual products, not their panels, captions, numbers, or sheet arrangement.
{{image_source_mapping}}

Composition: a continuous full-bleed inventory wall. Start with roughly 10–12 columns and 7–9 rows, rotate the entire arrangement approximately 10–12 degrees counterclockwise so rows rise toward the right, and crop it to fill the canvas edge-to-edge. Adapt the row and column counts to the number and shapes of the products; there is no fixed item-count limit. The grid continues beyond the canvas. Products at the edges may be naturally cropped, and every product does NOT need a fully visible copy. Do not add a large safe margin or shrink the entire grid to fit every item within the canvas.

Keep the individual products small. At the final 1200 px width, use approximately 60–80 px along the longer side and 90–115 px center-to-center grid spacing as an initial guide. Aim for 20–30 px of visible background between the nearest silhouettes of neighboring products, including wide products and paired items. Adjust the scale and grid counts to preserve these gaps and recognizable shapes as the number of sources grows. Preserve aspect ratios. Leave clear space between objects, with no touching or overlap.

Choose a varied selection of the available sources to suit the composition. Prioritize breathing room and visual balance. Use distinct products before repeating any, and spread necessary repeats evenly. Balance vivid colors throughout the quieter neutral-colored objects. Keep paired or grouped products together as supplied.

Scene/backdrop: completely flat opaque warm off-white #f8f7f3, matching the site's light-mode paper color; clean editorial catalog feel. Keep the natural colors of the supplied product photographs.
Style: crisp photographic cutouts, natural product colors, uniform delicate lighting, no exaggerated cast shadows. Flat 2D arrangement, not a perspective room, no floor horizon.
Text: Add the exact text "/picks." once, including the leading slash and trailing period. Place it horizontally in the lower-right corner, with 28–36 px inset from the right and bottom edges at final resolution, and at least 24 px of clear space from nearby products. Use regular-weight DM Mono lettering matching the site's wordmark, approximately 110 px at final 1200px width. The complete wordmark should span about one third of the canvas width. Color "picks" #282b25 and color the leading slash and trailing period #68764d, matching the site's light mode. Omit nearby products as needed to give the lettering room. Existing text printed on the supplied products stays on those products only. Add no other title, subtitle, captions, sheet numbers, or watermark.
Constraints: use only the supplied product types. Do not invent additional objects, people, scenery, cards, frames, borders, gradients, decorative marks or background textures. Never mirror product text. Deliver a polished full-bleed OG image in 1200:630 aspect ratio, with small products, a little space between them, broad variety, and a large /picks. wordmark in the light-mode palette.
```
