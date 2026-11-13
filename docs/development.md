# 開発時の補足

[READMEに戻る](../README.md)

## 初回のブラウザ準備

ブラウザテストには、npm依存関係とは別にブラウザ本体の導入が必要です。[Playwright公式ガイド](https://playwright.dev/docs/browsers#install-browsers)に従ってChromiumとWebKitをインストールしてください。

## Cloudflareでの配信確認

Cloudflare固有のリダイレクト・配信ヘッダーは `astro preview` では確認できません。変更時はWranglerのローカル環境、またはCloudflare上で確認してください。
