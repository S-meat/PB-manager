# PB商品 受発注管理システム

PB13商品（＋終売品）の受発注・在庫・販売予測を一元管理するアプリ。本店精肉・製造部・営業部が共通の入口から入出庫・発注登録・マスタ管理を行う。

仕様の正本は [`docs/技術引き継ぎ書.md`](docs/技術引き継ぎ書.md)。デプロイ手順は [`docs/セットアップ手順書.md`](docs/セットアップ手順書.md)。

## 構成図

```
[index.html]  ←fetch(GET/POST, text/plain)→  [GAS Web API (gas/code.gs)]  ←→  [Googleスプレッドシート]
GitHub Pages想定                                スプレッドシートに紐付け             データの正本
（s-meat アカウント）                            実行=オーナー/アクセス=全員          （旧ヨコレイ在庫Excelから移行済み）
                                                     └→ Slack Incoming Webhook 通知（設定シートで任意）
```

## リポジトリ構成

```
pb-manager/
  index.html          フロントエンド本体（単一HTML、ビルド不要）
  gas/code.gs          GASバックエンド（スプレッドシートのApps Scriptに全文貼り付けて使う）
  data/                 DB初期データ用フォルダ（xlsx実体はローカル参照専用・.gitignoreで公開リポジトリから除外）
  docs/                 仕様書・手順書一式
  assets/logo.png       ヘッダーロゴ
  tests/smoke.html      ブラウザ内スモークテスト
```

## セットアップ（概要）

詳細は [`docs/セットアップ手順書.md`](docs/セットアップ手順書.md) を参照。

1. 旧「ヨコレイ在庫管理表」から変換したxlsx（社内の実在庫データのため本リポジトリには含めない）をGoogleドライブにアップロードし、Googleスプレッドシートとして保存
2. スプレッドシートの拡張機能→Apps Scriptに `gas/code.gs` を全文貼り付け、ウェブアプリとしてデプロイ
3. `index.html` 冒頭の `const GAS_URL = "";` に発行されたURLを貼り付け
4. GitHub Pages等で公開
5. 運用開始前に **P03 GPベーコンクリームの棚卸確認**（技術引き継ぎ書§6・セットアップ手順書STEP5）が必須

`GAS_URL` が空のままだとローカル試用モード（この端末のみ・localStorage保存）で動作する。

## 動作確認（ローカル）

Node/Python環境が無い場合、`serve_static.ps1`（このリポジトリの一つ上の階層）でHttpListenerによる静的配信ができる。Claude Codeの `.claude/launch.json` に `pb-app`（port 8744）を登録済み。

- `index.html` を直接開く、またはpreviewサーバー経由で確認
- `tests/smoke.html` をブラウザで開くと、index.htmlをiframeで読み込みローカル試用モードのロジック（在庫計算・発注点判定・予測・工程遷移・マスタCRUD・終売除外）を検証し、画面上とconsole.log（`[SMOKE]`プレフィックス）に結果を出す

## 変更禁止事項

技術引き継ぎ書・引き継ぎプロンプトより：

- POSTは `Content-Type: text/plain` のfetch固定（application/jsonに変えるとCORSプリフライトでGASが受け取れなくなる）
- スプレッドシートの列順（GASが列番号で参照している）
- 発注点・予測ロジックの式（変える場合は依頼者に確認）
- 終売仕様（発注アラート・発注登録・入庫の対象外、在庫>0の間は出庫可能）
- モノトーン配色のデザイントークン
- GASの再デプロイは「デプロイを管理→既存デプロイの新バージョン」（URLを変えない）
- 実在庫データのxlsxは公開リポジトリにコミットしない（`.gitignore`で除外済み。ローカルの`data/`は各自の参照用）
