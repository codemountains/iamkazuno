# iamkaz.uno

**Things I use and love.**

トップページに `iamkaz.uno` を表示し、`/picks` でお気に入りの持ち物を紹介する、Astro + TypeScript + microCMS の静的サイトです。microCMSの `things` / `brands` / `categories` APIに対応しています。接続情報がなくても、8点のローカルサンプルとオリジナルSVGイラストですぐに動作します。

`/picks` の一覧では写真・アイテム名・ブランドを表示し、クリックすると `/picks/things/[id]` の詳細ページへ移動します。説明文は詳細ページに表示します。コレクションのヘッダーに `/picks.` とサブタイトルを配置しています。

## ローカルで表示する

Node.js 24 LTS と npm を使用します。

```sh
npm ci
npm run dev
```

表示先: トップは <http://localhost:4321/>、コレクションは <http://localhost:4321/picks>。初回は `.env` の作成も不要です。サンプルの商品名・説明・イラストは架空で、実際の所有物やレビューを表すものではありません。

公開URLはトップが `https://iamkaz.uno`、コレクションが `https://iamkaz.uno/picks` です。Astroのbaseはルートのまま、ページルートで `/picks` 配下を構成しています。ページURLは末尾スラッシュなしに統一し、Cloudflareでは旧 `/things/[id]` から `/picks/things/[id]` に301リダイレクトします。

## コマンド

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー |
| `npm run check` | Astro / TypeScript の型チェック |
| `npm test` | 接続設定・コンテンツ検証・リッチテキスト処理のテスト |
| `npm run build` | `dist/` へ静的ファイルを生成 |
| `npm run preview` | ビルド結果をローカルで表示 |
| `npm run deploy` | ビルド後、Cloudflareへ公開（ログイン・アカウントが必要） |

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
- `MICROCMS_API_KEY`: `things` / `brands` / `categories` のGET権限を持つキー。書き込み権限は不要です。
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

カテゴリフィルターは `all` と、`categories` APIから取得したカテゴリで構成します。コード内に固定カテゴリを追加しません。1つのアイテムに複数のカテゴリを設定でき、いずれのカテゴリからも絞り込めます。サンプルも実APIと同じフィールド構造で管理しています。

サンプルは `mountain`（ブーツ・バックパック・腕時計）、`ski`（スキー板・ゴーグル）、`myog`（トートバッグ・スタッフサック）、`other`（カメラ）の8点です。`all` は全件表示用のフィルターで、カテゴリデータには含めません。

### 未入力・参照先がない場合

- 名前が未入力の場合は「名前のないアイテム」「名前のないブランド」「名前のないカテゴリ」を表示します。
- メイン画像が未入力の場合はプレースホルダーを表示します。
- ブランドが未入力、または参照先を取得できない場合はブランドなしとして扱います。
- カテゴリ参照が未入力の場合はカテゴリなしとして扱います。取得できない参照先は除外し、架空のカテゴリは作成しません。
- 説明が未入力、または空の段落だけの場合は詳細ページの空状態を表示します。

任意フィールドの未入力と型不正は区別します。たとえば `ref_categories` に配列以外が返る場合や、指定された画像の寸法が不正な場合はビルドを失敗させます。

### 画像と説明文

メイン画像はmicroCMSの画像APIで幅とWebP形式を指定して配信します。通常の外部画像URLも表示できます。

`description` はビルド時に `sanitize-html` で処理してから、詳細ページでHTMLとして表示します。見出し、段落、強調、箇条書き、引用、コード、リンク、表、画像などの基本書式に対応しています。`script` / `iframe` / `style` などの実行可能な埋め込みや、イベント属性、危険なURLは除去します。見出しの `h1` はページタイトルと重複しないよう `h2` に変換します。

`things` に商品URL専用フィールドはありません。リンクを載せる場合は説明文内に設定してください。説明内のリンクはHTTP / HTTPS / メール、サイト内パス、ページ内リンクに対応します。

## Cloudflare Workers Static Assetsへの公開

`wrangler.jsonc` は、Workerスクリプトを持たず `dist/` の静的ファイルだけを配信する構成です。Cloudflare adapterやサーバー実行環境は不要です。`iamkaz.uno` のCustom Domain設定を含めており、デプロイ時にこのドメインへ接続します。

1. GitHubにこのリポジトリを配置し、Cloudflare Workers Buildsで接続します。
2. 必要に応じて `wrangler.jsonc` の `name` を変更します。
3. ビルドコマンドを `npm run build`、デプロイコマンドを `npx wrangler deploy` にします。
4. **ビルド環境** に `DATA_SOURCE=microcms`、`MICROCMS_SERVICE_DOMAIN`、`MICROCMS_API_KEY` を設定します。`SITE_URL` は既定で `https://iamkaz.uno` です。APIキーはSecretとして保存してください。静的生成のため、Worker実行時の `wrangler secret put` だけではビルドに渡りません。
5. `iamkaz.uno` を管理しているCloudflareアカウントでデプロイします。Wranglerの `routes` に設定したCustom Domainを使い、CloudflareがDNSレコードと証明書を管理します。

`assets.html_handling` は `drop-trailing-slash` です。`/picks/` へのアクセスも `/picks` へ正規化されます。旧詳細ページはCloudflareの `public/_redirects` で301転送し、Astroの `redirects` でも開発サーバーと静的HTML用の転送を定義しています。

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
- `src/styles/global.css`: 色、余白、フォント、レスポンシブ表示
- `src/data/sample.ts`: 実APIと同じ構造のサンプルアイテム・ブランド・カテゴリ
- `public/images/samples/`: オリジナルのサンプルSVG
- `src/lib/content.ts`: サンプル / microCMSの切り替えと取得
- `src/lib/content-validation.ts`: 接続情報とCMSコンテンツの検証
- `src/lib/rich-text.ts`: 説明文のHTMLをサニタイズ
- `src/scripts/filters.ts`: カテゴリ絞り込み、URL共有、ブラウザの戻る・進む

ヘッダーの太陽・月のアイコントグルでライト / ダークを切り替えます。初期状態はシステム設定に従い、手動で切り替えるまではOSのテーマ変更にも追従します。手動で選んだテーマはブラウザの `localStorage` に保存し、ページ移動・再読み込み後も維持します。

フォントとサンプル画像はローカル配信です。JavaScriptが無効でも一覧と静的な詳細ページを表示します。キーボード操作、スキップリンク、読み上げ用の絞り込み件数、動きを減らす設定に対応しています。

下書きの画面プレビューは未実装です。microCMSモードでは公開済みコンテンツを取得します。CMSでの更新を静的な公開サイトへ反映するには、再ビルド・再公開が必要です。
