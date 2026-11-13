# iamkaz.uno

**Things I use and love.**

トップページに `iamkaz.uno` を表示し、`/picks` でお気に入りの持ち物を紹介する、Astro + TypeScript + microCMS の静的サイトです。microCMSの `things` / `brands` / `categories` APIに対応しています。接続情報がなくても、100点のローカルサンプルと共通のSVG画像1枚ですぐに動作します。

`/picks` の一覧では写真・アイテム名・ブランドを表示し、クリックすると `/picks/things/[id]` の詳細ページへ移動します。説明文は詳細ページに表示します。コレクションのヘッダーに `/picks.` とサブタイトルを配置しています。

## ローカルで表示する

Node.js 24 LTS と npm を使用します。

```sh
npm ci
npm run dev
```

表示先: トップは <http://localhost:4321/>、コレクションは <http://localhost:4321/picks>。初回は `.env` の作成も不要です。サンプルの商品名・説明は架空で、実際の所有物やレビューを表すものではありません。

公開URLはトップが `https://iamkaz.uno`、コレクションが `https://iamkaz.uno/picks` です。Astroのbaseはルートのまま、ページルートで `/picks` 配下を構成しています。ページURLは末尾スラッシュなしに統一し、Cloudflareでは旧 `/things/[id]` から `/picks/things/[id]` に301リダイレクトします。

## コマンド

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー |
| `npm run check` | Astro / TypeScript の型チェック |
| `npm test` | 接続設定・コンテンツ検証・リッチテキスト処理のテスト |
| `npm run test:e2e` | サンプルの本番ビルドを生成し、PC・モバイルのブラウザテストを実行 |
| `npm run test:e2e:ui` | PlaywrightのUIでE2Eテストを実行・調査 |
| `npm run build` | `dist/` へ静的ファイルを生成 |
| `npm run preview` | ビルド結果をローカルで表示 |
| `npm run deploy` | ビルド後、Cloudflareへ公開（ログイン・アカウントが必要） |

### E2Eテスト

初回は依存関係とChromium・WebKitをインストールしてから実行します。

```sh
npm ci
npx playwright install chromium webkit
npm run test:e2e
```

Playwrightが `DATA_SOURCE=sample` で本番ビルドを生成し、`http://127.0.0.1:4322` に `astro preview` を起動します。microCMSの接続情報はテスト用プロセスで両方空に設定するため、ローカルの `.env` やCMSの更新に影響されません。ポート4322はテスト専用で、既存サーバーは再利用しません。`dist/` はサンプルの成果物で上書きされるため、本番公開時は通常の公開手順でmicroCMSからビルドし直してください。

ChromiumのPC（1280×800）とモバイルエミュレーション（390×844・タッチ対応）で、主要なページ遷移、カテゴリ・URL・履歴の同期、詳細からのスクロール位置復元、画像サイズ、テーマの保存、キーボード操作、JavaScript無効時の閲覧、任意フィールド未入力時の表示を検証します。画像のテストはWebKitのiPhone 16エミュレーションでも実行し、リロード後のサイズ操作中の読み込みと、仮画像のデコード・透明性を確認します。エミュレーションは実機Safariの検証ではありません。Cloudflare固有のリダイレクト・配信ヘッダーは `astro preview` の検証対象外です。

```sh
npm run test:e2e -- --project=mobile-chromium
npm run test:e2e:ui
npx playwright show-report
```

テストは `tests/e2e/` にあり、既存の `npm test` とは独立しています。失敗時のスクリーンショットとトレースは `test-results/`、HTMLレポートは `playwright-report/` に保存します。GitHub Actionsの `Check` でも型チェック・既存テストに続けて実行し、レポートを7日間保存します。Linuxでの初回セットアップは `npx playwright install --with-deps chromium webkit` を使用してください。

### 成果物の軽量化

`npm run build` は静的ページを生成した後、次の処理を自動実行します。

- テーマと一覧の初期化に使うインラインJavaScriptを圧縮します。HTML内の実行位置と属性を保ち、描画前のテーマ・カテゴリ・サイズ適用を維持します。ソースの可読性や開発サーバーの出力は変えません。
- `public/og-picks.png` を品質90・4:4:4のJPEGに変換し、成果物には `og-picks.jpg` だけを含めます。OGメタタグはビルド時にJPEG、開発時に元のPNGを参照します。Cloudflareでは旧PNG URLもJPEGへ301転送します。`public/og-home.png` は画素を変えずPNGを再圧縮します。OG画像を更新するときは、従来どおり `public/` の元PNGを差し替えてください。
- `public/images/samples/sample.svg` は、生成HTMLから参照されている場合だけ成果物に残します。microCMSのページで使わないサンプル画像は配信せず、サンプルモードや説明文で必要な場合は維持します。
- フォントは `src/styles/fonts.css` でDM Sans Latin variableとDM Mono Latin 400のWOFF2だけを読み込みます。Latin拡張の専用ファイルと旧WOFF形式は含めません。日本語などは既存のシステムフォントへフォールバックします。
- 旧 `/things/[id]` 用のリダイレクトHTMLは生成せず、Cloudflareの `public/_redirects` で301転送します。`astro dev` では設定した転送が使えますが、`astro preview` では旧URLの転送を再現しません。転送確認にはWranglerのローカル実行またはCloudflare上の環境を使用します。

## microCMSを後から接続する

```sh
cp .env.example .env
```

`.env` に以下を設定し、開発サーバーを再起動します。

```dotenv
DATA_SOURCE=auto
MICROCMS_SERVICE_DOMAIN=your-service-id
MICROCMS_API_KEY=your-read-only-api-key
SITE_URL=https://iamkaz.uno
```

- `MICROCMS_SERVICE_DOMAIN`: サービスIDのみ。`https://` と `.microcms.io` は含めません。
- `MICROCMS_API_KEY`: `things` / `brands` / `categories` のコンテンツAPIのGET権限を持つキー。公開用キーでは「下書きコンテンツ全取得」「公開終了コンテンツ全取得」を無効にします。
- `SITE_URL`: 本番サイトのURL。canonicalとOGP画像の絶対URLに使います。未設定時は `https://iamkaz.uno` を使用します。別の公開先を使う場合に上書きできます。
- APIキーはビルド時だけ使用し、生成済みHTMLやブラウザ用JavaScriptには含めません。`.env` はGit対象外です。

### データソースの切り替え

| `DATA_SOURCE` | 動作 |
| --- | --- |
| `auto`（既定） | 接続情報なしならサンプル、2項目とも設定済みならmicroCMS |
| `sample` | 明示的にサンプルを表示 |
| `microcms` | 接続情報を必須にする。本番公開時はこちらを推奨 |

どのモードでも、接続情報が片方だけ設定されている場合は設定エラーになります。`sample` に戻す場合は、両方とも空欄にするか、両方とも設定したままにしてください。

CMS接続後の通信エラーやフィールドの型不正ではビルドを失敗させます。サンプルや空一覧へ自動的に置き換えません。CMSが正常に空リストを返す場合は、空のコレクションを表示します。

### microCMSのAPIスキーマ

MCPから取得した既存の3つの **リスト形式API** に合わせています。すべてのカスタムフィールドは任意入力です。

`brands` / `categories`:

| フィールドID | 種類 | 用途 |
| --- | --- | --- |
| `name` | テキストフィールド | ブランド名 / カテゴリ名 |

`things`:

| フィールドID | 種類 | 補足 |
| --- | --- | --- |
| `name` | テキストフィールド | アイテム名 |
| `description` | リッチエディタ | 詳細ページで表示する説明 |
| `main_image` | 画像 | メイン画像。代替テキストも設定推奨 |
| `ref_brand` | コンテンツ参照 | `brands`への単一参照 |
| `ref_categories` | 複数コンテンツ参照 | `categories`への複数参照 |

`id` はmicroCMSの標準コンテンツIDを使用し、詳細ページのURLにも使います。3つのAPIを `getAllContents()` で全件取得するため、APIの既定件数に切り詰められません。アイテムとカテゴリの表示順はAPIの取得順を維持します。

ビルド時の取得は、`things` / `brands` / `categories` のコンテンツAPIに統一しています。`draftKey` を指定せず、APIが返した内容で一覧・件数・詳細ページ・旧URLリダイレクトを生成します。「下書きコンテンツ全取得」「公開終了コンテンツ全取得」を無効にしたキーでは、公開中のコンテンツと「公開中かつ下書き中」の公開版が取得対象になります。下書きや公開終了への変更は、再ビルド時に反映されます。

- [コンテンツのステータス](https://document.microcms.io/manual/content-status)
- [APIキーの権限設定](https://document.microcms.io/content-api/x-microcms-api-key)

カテゴリフィルターは `all` と、`categories` APIから取得したカテゴリで構成します。コード内に固定カテゴリを追加しません。1つのアイテムに複数のカテゴリを設定でき、いずれのカテゴリからも絞り込めます。サンプルも実APIと同じフィールド構造で管理しています。

サンプルは100点です。元の8点（ブーツ・バックパック・腕時計・スキー板・ゴーグル・トートバッグ・スタッフサック・カメラ）に、87点の連番バリエーションと、複数カテゴリ・画像なし・ブランドなし・説明なし・カテゴリなしの5点を加えています。追加分は商品名でサンプルと分かるようにしています。画像を設定したサンプルはすべて `public/images/samples/sample.svg` の1枚を共用し、画像なしのサンプルはプレースホルダーを表示します。カテゴリ別には `mountain` 26点、`ski` 25点、`myog` 26点、`other` 23点で、複数カテゴリの商品は各カテゴリに含まれます。長い一覧のスクロール、絞り込み、詳細ページからの位置復元を本番に近い件数で確認できます。`all` は全100点の表示用フィルターで、カテゴリデータには含めません。

### 未入力・参照先がない場合

- 名前が未入力の場合は「名前のないアイテム」「名前のないブランド」「名前のないカテゴリ」を表示します。
- メイン画像が未入力の場合はプレースホルダーを表示します。
- ブランドが未入力、または参照先を取得できない場合はブランドなしとして扱います。
- カテゴリ参照が未入力の場合はカテゴリなしとして扱います。取得できない参照先は除外し、架空のカテゴリは作成しません。
- 説明が未入力、または空の段落だけの場合は詳細ページの空状態を表示します。

任意フィールドの未入力と型不正は区別します。たとえば `ref_categories` に配列以外が返る場合や、指定された画像の寸法が不正な場合はビルドを失敗させます。

### 画像と説明文

メイン画像はmicroCMSの画像APIで幅と品質（一覧80・詳細85）を指定し、`picture` でAVIFを優先、WebPをフォールバックとして配信します。小さく表示する一覧では転送量を抑え、詳細では細部を確認できる品質を維持します。`auto=format` はmicroCMSで非対応のため使いません。通常の外部画像URLやSVGは変換せず表示します。

microCMS画像を含む一覧・詳細ページでは、画像CDNへ `preconnect` して接続を前倒しします。トップやローカルサンプルだけのページでは事前接続しません。詳細のメイン画像は即時読み込みに加えて `fetchpriority="high"` を指定し、優先的に取得します。

一覧には80 / 120 / 160 / 240 / 320 / 400 / 480 / 640 / 960px、詳細には480 / 640 / 960 / 1280pxの画像候補を用意します。80 / 120pxの候補で小さいカードの転送量を抑え、400pxの候補で320pxを少し超える画像を必要とする画面での過大配信を減らします。元画像より大きい候補は元の幅に揃えて重複を除去し、`sizes` は画像内の余白を除いた描画幅を指定します。ブラウザが画面幅と画素密度に応じて候補を選ぶため、画像APIの `dpr` は併用しません。

カテゴリ付きURLでは、カードのHTMLを読み込む前に対象外を隠し、初期表示の絞り込み・件数をインラインのJavaScriptで確定します。画像のURLと候補は最初はデータ属性に保持し、HTMLの解析中から表示対象の先頭4カード内の画像を `eager` / `fetchpriority="high"` で取得します。残りは `IntersectionObserver` で画面の上下240px以内へ来た時点で有効化し、ブラウザ標準の遅延読み込みによる遠方画像の一斉取得を抑えます。同じタイミングで読み込む画像の `sizes` は、代表画像の余白を除いた実幅で揃えてからURLを有効化します。サイズスライダーの操作中に画面付近へ現れた画像も、その時点の `sizes` で取得します。モバイルでは操作確定まで配信幅を維持し、確定時に全画像を最終サイズへ揃えます。取得前の仮画像にはSafariでもデコードできる透明な1px GIFを使います。

画像処理は外部の操作用JavaScriptを待たずに動作し、カテゴリ変更・画面サイズ変更・履歴復帰後にも表示位置を再確認します。`IntersectionObserver` 非対応時は表示対象の全画像を読み込みます。JavaScript無効時は `noscript` の画像で全件表示を維持します。カテゴリ操作用のJavaScriptは、URLのカテゴリが一致すれば初期状態を引き継ぎ、絞り込みや件数を再適用しません。

`description` はビルド時に `sanitize-html` で処理してから、詳細ページでHTMLとして表示します。見出し、段落、強調、箇条書き、引用、コード、リンク、表、画像などの基本書式に対応しています。`script` / `iframe` / `style` などの実行可能な埋め込みや、イベント属性、危険なURLは除去します。見出しの `h1` はページタイトルと重複しないよう `h2` に変換します。

`things` に商品URL専用フィールドはありません。リンクを載せる場合は説明文内に設定してください。説明内のリンクはHTTP / HTTPS / メール、サイト内パス、ページ内リンクに対応します。

## Cloudflare Workers Static Assetsへの公開

`wrangler.jsonc` は、Workerスクリプトを持たず `dist/` の静的ファイルだけを配信する構成です。Cloudflare adapterやサーバー実行環境は不要です。`iamkaz.uno` のCustom Domain設定を含めており、デプロイ時にこのドメインへ接続します。

Worker名は `iamkazuno` です。既存のWorker名が `picks` の場合は、次回デプロイ前にCloudflareの画面で既存Workerを `iamkazuno` に変更し、`wrangler.jsonc` の `name` と一致させてください。

### GitHub Actionsから手動で公開する

`.github/workflows/deploy.yml` の `Deploy` ワークフローを手動実行すると、選択したブランチのコードを型チェック・テストし、最新のmicroCMSデータでビルドして `https://iamkaz.uno` に公開します。同じ公開先へのデプロイは同時に1件だけ実行します。

1. GitHubリポジトリの **Settings → Secrets and variables → Actions → New repository secret** から、以下の4項目を登録します。

   | Secret名 | 設定する値 |
   | --- | --- |
   | `CLOUDFLARE_API_TOKEN` | デプロイ用のCloudflare APIトークン |
   | `CLOUDFLARE_ACCOUNT_ID` | `iamkaz.uno` を管理しているCloudflareアカウントのID |
   | `MICROCMS_SERVICE_DOMAIN` | microCMSのサービスID |
   | `MICROCMS_API_KEY` | 3 APIのコンテンツAPIのGET権限を持ち、「下書きコンテンツ全取得」「公開終了コンテンツ全取得」を無効にしたキー |

2. 同じ画面の **Variables → New repository variable** から、`SITE_URL` を値 `https://iamkaz.uno` で登録します。ワークフローは `${{ vars.SITE_URL }}` をビルド時の環境変数に渡します。
3. Cloudflare APIトークンは **Edit Cloudflare Workers** テンプレートから作成し、対象アカウントと `iamkaz.uno` のゾーンに範囲を限定します。Custom Domainの設定に必要な **Workers Routes** の編集権限を含め、ドメインのゾーンがActiveになっていることを確認してください。
4. ワークフローをデフォルトブランチへ反映します。GitHubの **Actions → Deploy → Run workflow** で、公開するブランチ（通常は `main`）を選択して実行します。
5. 完了後、`https://iamkaz.uno`、`/picks`、商品詳細ページと画像を確認します。

ビルドには `DATA_SOURCE=microcms` と、リポジトリ変数の `SITE_URL` を設定しています。必要なSecretが未設定の場合は、設定名をログに表示して処理を終了します。microCMSの内容を更新した後も、同じワークフローを再実行すると公開内容に反映されます。

- [GitHub Actionsの手動実行](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
- [GitHub ActionsのVariables設定](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables)
- [CloudflareのGitHub Actions設定とAPIトークン作成](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)

### Workers Buildsを使う場合

1. GitHubにこのリポジトリを配置し、Cloudflare Workers Buildsで接続します。
2. Cloudflare上のWorker名を `wrangler.jsonc` の `name`（`iamkazuno`）と一致させます。
3. ビルドコマンドを `npm run build`、デプロイコマンドを `npx wrangler deploy` にします。
4. **ビルド環境** に `DATA_SOURCE=microcms`、`MICROCMS_SERVICE_DOMAIN`、`MICROCMS_API_KEY` を設定します。`SITE_URL` は既定で `https://iamkaz.uno` です。APIキーはSecretとして保存してください。静的生成のため、Worker実行時の `wrangler secret put` だけではビルドに渡りません。
5. `iamkaz.uno` を管理しているCloudflareアカウントでデプロイします。Wranglerの `routes` に設定したCustom Domainを使い、CloudflareがDNSレコードと証明書を管理します。

`assets.html_handling` は `drop-trailing-slash` です。`/picks/` へのアクセスも `/picks` へ正規化されます。旧詳細ページはCloudflareの `public/_redirects` で301転送し、Astroの `redirects` でも開発サーバー用の転送を定義しています。`build.redirects: false` により、転送専用の静的HTMLは生成しません。

- [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)

サンプルのまま公開する場合は `DATA_SOURCE=sample` にします。サンプルページには `noindex` が付き、実データに切り替えると外れます。

### CMS更新時の自動再ビルド

Workers Buildsで本番ブランチのDeploy Hookを作り、microCMSの `things` / `brands` / `categories` の3 APIすべてのWebhookに「カスタム通知」として登録します。ブランド名・カテゴリ名の変更も一覧や詳細ページに反映されます。Hook URLは公開せず、microCMS内で保管してください。

公開・更新・並べ替え・公開終了・削除のうち公開内容に影響するイベントを対象にします。反映されるのはビルド完了後です。microCMSのWebhook失敗時には自動再送がないため、Cloudflare側で手動再ビルドを行ってください。ビルド失敗時には以前の正常なデプロイが残ります。

- [Workers Deploy Hooks](https://developers.cloudflare.com/workers/ci-cd/builds/deploy-hooks/)
- [microCMS Webhook設定](https://document.microcms.io/manual/webhook-setting)

## 画面と編集箇所

- `src/pages/index.astro`: `iamkaz.uno` を表示するトップページ
- `src/pages/picks/index.astro`: コレクション一覧とカテゴリフィルター
- `src/pages/picks/things/[id].astro`: アイテムの詳細ページを静的生成
- `src/components/ItemCard.astro`: 詳細ページへ移動するアイテムカードと画像配信
- `src/components/ThingImage.astro`: AVIF / WebPの切り替えと描画幅に応じた画像候補の指定
- `src/components/CollectionImages.astro`: 初期画像の優先読み込み・サイズ操作中を含む画面付近の画像取得
- `src/lib/thing-image.ts`: microCMS画像APIのURL生成と元画像幅を超えない候補の作成
- `src/styles/global.css`: 色、余白、フォント、レスポンシブ表示
- `src/data/sample.ts`: 実APIと同じ構造のサンプルアイテム・ブランド・カテゴリ
- `public/images/samples/sample.svg`: サンプル商品が共用する汎用SVG画像
- `src/lib/content.ts`: サンプル / microCMSの切り替えと取得
- `src/lib/content-validation.ts`: 接続情報とCMSコンテンツの検証
- `src/lib/rich-text.ts`: 説明文のHTMLをサニタイズ
- `src/scripts/filters.ts`: カテゴリ絞り込み、URL共有、ブラウザの戻る・進む
- `src/scripts/filter-motion.ts`: PCの短距離の再配置とフェード、タッチ操作時の短いフェード
- `src/scripts/item-interactions.ts`: タッチ・ペンの押下反応とスクロール時の解除
- `src/scripts/picks-navigation.ts`: 詳細から戻る際のカテゴリ・閲覧位置の復元
- `src/scripts/collection-size.ts`: 画像サイズの変更・画像配信幅の更新・閲覧位置の維持
- `src/components/CollectionSizeControl.astro`: 画面下部に浮かぶ画像サイズスライダー
- `src/scripts/size-control.ts`: スクロール・ポインター操作・キーボード操作に応じたスライダーの表示

一覧は画面幅いっぱいに道具を並べ、下部中央のスライダーでサイズを変更できます。PCでは画像枠の最小幅を88〜280px（8px刻み、初期値160px）に変更し、画面幅に合わせて最大18列で並べます。横長の画面でも18列を超えず、上限に達したあとはスライダーを小さくしてもカード幅は変わりません。600px以下では左端6列・中央3列・右端1列に切り替わり、初期表示は中央の3列です。少数のカテゴリでも空き列を保つため、絞り込みだけでカードを引き伸ばしません。画像枠と `object-fit: contain` を維持し、画像はトリミングしません。実際のカード幅が128px未満になると、ブランド名・商品名を視覚的に隠します。88px未満では画像内の余白を縮め、番号・カテゴリーも省いて画像を見やすくします。リンクの読み上げ名は維持します。

画像サイズは操作確定時に `sessionStorage` に保存し、同じタブでの再読み込み・詳細ページからの戻りでも維持します。連続入力は1フレームに1回、最新値だけを反映し、PC・モバイルとも実際の列数が変わらない場合は寸法計測とスクロール補正を省きます。モバイルの操作中は列数とスライダー表示だけを更新し、画像幅の計測とAVIF・WebPの `sizes` 更新は操作確定時にまとめます。これにより、指を動かしている間の画像候補の切り替えを抑えます。PCの列数はCSSと共通の列間・上限と、保持したグリッド幅から判定し、18列上限に達した範囲でも不要な計測を行いません。画面幅が変わった場合は幅を更新します。ページ離脱・画面非表示・フォーカス移動・タッチ操作の中断時にも保留中の値を反映・保存します。保存値はカードを描画する前に適用し、サイズ調整中も見ていたアイテムの縦位置を保ちます。先頭カードが見えている間は上端位置が変わらないため、変更後の位置計測とスクロール補正を省きます。JavaScript無効時はサイズ操作を表示せず、通常の一覧・詳細リンクとして利用できます。

サイズスライダーはスクロール中に隠れ、停止から400ms後に再表示します。ドラッグ中とキーボードフォーカス中は表示を維持し、ポインターで操作した後の通常スクロールでは再び隠れます。safe-areaを考慮した下端位置と、一覧ページ末尾の余白でアイテムやフッターを覆い続けないようにしています。600px以下ではカテゴリを1行に収め、カテゴリの件数と横スクロールボタンを省きます。長いカテゴリ名は省略表示し、読み上げには完全な名前を使います。

一覧と詳細のヘッダー・フッターは、左右32px（600px以下では16px）の共通余白で表示します。詳細本文は独立したコンテナに置き、最大800pxの幅と従来のレスポンシブ余白を維持します。

ヘッダーの太陽・月のアイコントグルでライト / ダークを切り替えます。初期状態はシステム設定に従い、手動で切り替えるまではOSのテーマ変更にも追従します。手動で選んだテーマはブラウザの `localStorage` に保存し、ページ移動・再読み込み後も維持します。

フォントとサンプル画像はローカル配信です。JavaScriptが無効でも一覧と静的な詳細ページを表示します。キーボード操作、スキップリンク、読み上げ用の絞り込み件数、動きを減らす設定に対応しています。

一覧の画像サイズや余白を変えず、PCでは画像が2pxだけ浮き、タッチ・ペンでは押している画像枠の背景色がわずかに変わります。カテゴリ切替は選択結果とURLを即時更新し、PCでは近くの位置への移動とフェード、タッチ操作では160msのフェードを加えます。連続操作では古い演出を解除し、動きを減らす設定では即時切替にします。詳細画面への遷移演出はありません。

同じタブで一覧のアイテムを開いた場合、詳細の「Back to picks」で選択カテゴリとクリック前の画面内位置を復元します。詳細ページを再読み込みしても戻り先は維持します。詳細URLを直接開いた場合や、新しいタブで開いた場合は全件一覧の先頭へ戻ります。戻り先・カテゴリリンクに `#collection` は付けません。復元にはタブ内の `sessionStorage` と履歴情報を使用し、ストレージが利用できない場合も通常のリンクとして一覧へ移動できます。

商品カードの先読みは初期ページの読み込み後に開始し、画面内に300ms表示されたリンクのHTMLを低優先度・最大2件ずつ取得します。本文の転送完了まで同時数の枠を保持し、待機中に非表示カテゴリや画面外になったカードは取得しません。非表示タブでは新規取得を止め、ページを離れると実行中の先読みも中断します。履歴から復帰すると再開します。対応ブラウザがデータ節約・低速回線を検出した場合は押下時まで控え、オフライン中は取得しません。

他のリンクにはAstro標準の先読みを使います。トップの `/picks` リンクは画面内に300ms表示されると取得し、詳細では戻り先のカテゴリ付きURLを確定してからその一覧だけを取得します。ロゴ・フッター・詳細のカテゴリリンクはホバーまたはキーボードフォーカス時に取得します。先読みは移動先HTMLの取得に限定し、画像などの追加取得やページのJavaScript実行は行いません。通常のページ遷移と履歴復元を維持します。

`public/_headers` で `/`、`/picks`、`/picks/things/:id` のHTMLに `Cache-Control: public, max-age=60, must-revalidate` を設定します。先読み済みHTMLを再確認の通信なしで再利用し、60秒経過後のアクセス時にCloudflareのETagで更新確認します。このため再公開した内容の表示が最大60秒遅れる場合があります。ハッシュ付きの `/_astro/*` は従来どおり1年間キャッシュします。開発サーバーと `astro preview` はこのCloudflare用ヘッダーを適用しません。

下書きの画面プレビューは未実装です。microCMSモードのthingsは、下書きを含まない公開中のものだけをビルド対象にします。CMSでの更新を静的な公開サイトへ反映するには、再ビルド・再公開が必要です。
