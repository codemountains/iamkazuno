# 公開のための外部設定

[READMEに戻る](../README.md)

## GitHub Actionsから公開する

1. 公開ドメインを管理するCloudflareアカウントで、ゾーンをActiveにします。[Custom Domainsの前提条件](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) を確認してください。
2. Cloudflareの **Edit Cloudflare Workers** テンプレートから、対象アカウント・ゾーンに範囲を限定したAPIトークンを作成します。アカウントIDの確認も含め、[公式の認証設定](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) を参照してください。
3. microCMSで公開用APIキーを用意します。必要な権限は [.env.example](../.env.example)、作成場所は [microCMSのAPIキー設定](https://document.microcms.io/content-api/x-microcms-api-key) を参照してください。
4. GitHubの **Settings → Secrets and variables → Actions** に、[deploy.yml](../.github/workflows/deploy.yml) が参照する認証情報を **Secrets**、公開URLを **Variables** として登録します。
5. ワークフローをデフォルトブランチへ反映し、**Actions → Deploy → Run workflow** から公開するブランチを選んで実行します。[手動実行の公式手順](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow) を参照してください。

## Workers Buildsを使う場合

CloudflareでGit連携する場合は、対象Workerの **Settings → Builds** からリポジトリを接続します。[接続方法](https://developers.cloudflare.com/workers/ci-cd/builds/) と [ビルド設定](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) に従って設定してください。

CMSの接続情報は、[.env.example](../.env.example) を参照してビルド設定の **Build variables and secrets** に登録します。Worker実行時の変数・Secretとは設定先が異なります。

## CMS更新で再ビルドする場合

Workers Buildsの接続後、次の外部設定を行います。

1. Cloudflareの **Settings → Builds → Deploy Hooks** で、本番ブランチを対象とするHookを作成します。[Deploy Hooksの公式手順](https://developers.cloudflare.com/workers/ci-cd/builds/deploy-hooks/) を参照してください。
2. microCMSで利用する各APIの **API設定 → Webhook** を開き、「カスタム通知」にHook URLを登録します。公開内容が変わる操作を通知対象にします。[Webhookの設定と通知タイミング](https://document.microcms.io/manual/webhook-setting) を参照してください。

Hook URL自体が認証情報になるため、リポジトリには保存しないでください。microCMSはWebhook失敗時に自動再送しないため、通知に失敗した場合はCloudflare側で手動再ビルドします。
