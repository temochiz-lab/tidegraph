# TideGraph PWA

iPhoneのホーム画面から1タップで開き、その日のタイドグラフを大きく確認するための釣り用PWAです。GitHub Pagesだけで動作し、閲覧時に気象庁へ直接アクセスしません。

## 概要

TideGraph PWAは、釣行中にスマートフォンで素早く潮位を確認するための静的Webアプリです。気象庁の年次潮位表テキストを事前にJSONへ変換し、ブラウザ上で24時間のタイドグラフ、満潮・干潮、現在時刻線をSVGで表示します。

日付はカレンダーから直接選択できます。初回読み込み後はアプリ本体と潮位データをService Workerでキャッシュし、同じ地点・同じ年のデータをオフラインでも確認できます。

## 構成

- フロントエンド: Vanilla JavaScript + HTML + CSS
- グラフ: JavaScriptで生成するSVG
- データ: 気象庁の年次潮位表テキストを事前にJSONへ変換
- PWA: manifest + Service Worker
- 初期対応地点: 東京 `TK`

## ローカル起動

Service Workerを確認するため、`file://` ではなくHTTPサーバーで開いてください。

```bash
python -m http.server 8000
```

ブラウザで `http://localhost:8000/` を開きます。

## データimport

Node.js 18以降を使います。

```bash
npm run data:import
```

任意の年・地点を指定する場合:

```bash
node scripts/import-jma-tides.mjs --year 2026 --station TK --name 東京
```

出力先は `data/{year}/{station}.json` です。importerは固定カラムを機械的に変換し、値の補正・平滑化・推定は行いません。

## 地点追加

1. `data/stations.json` に地点コードと名称を追加します。
2. `node scripts/import-jma-tides.mjs --year YYYY --station XX --name 地点名` を実行します。
3. 生成された `data/YYYY/XX.json` をコミットします。

URLで地点を直接指定できます。

```text
./?stn=TK
```

## テスト

```bash
npm test
```

parserの最低限の受入条件として、24個の毎時潮位、負の潮位、9999/999の欠損除外、地点不一致、重複日付、短い固定カラム行を検証します。

## GitHub Pages公開

`.github/workflows/pages.yml` にGitHub Pages用のカスタムworkflowを用意しています。GitHub公式ドキュメントの現行例に合わせ、`actions/checkout@v6`、`actions/configure-pages@v5`、`actions/upload-pages-artifact@v4`、`actions/deploy-pages@v4` を使います。

公開手順:

1. GitHubにリポジトリを作成して、この内容を `main` ブランチへpushします。
2. Repository Settings > Pages で Source を GitHub Actions に設定します。
3. Actionsの `Deploy GitHub Pages` が成功すると、Pages URLが発行されます。

## iPhoneホーム画面への追加

1. iPhoneのSafariでGitHub Pages URLを開きます。
2. 共有ボタンを押します。
3. 「ホーム画面に追加」を選びます。
4. 追加されたアイコンから起動します。

## オフライン確認

1. オンライン状態でアプリを一度開き、東京TKのグラフを表示します。
2. Safariの開発者ツール、または機内モード相当の状態でオフラインにします。
3. 同じ地点・同じ年のJSONがキャッシュから表示されることを確認します。

初回読み込み前にオフラインの場合は、データ取得ができないため表示できません。

## データ出典と免責

出典: 気象庁潮位表データをもとに本アプリで表示加工。

本アプリの潮位は予測値です。風、気圧、波浪などによる実際の海面変動は反映しません。安全航行用の装置として扱わず、専門的な航海・海上安全判断には使用しないでください。

## データ更新メモ

年次予測データをリポジトリに取り込む方式です。通常閲覧時には気象庁ドメインへリクエストしません。気象庁のURLや固定カラム仕様が変わった場合は、`scripts/import-jma-tides.mjs` の `BASE_URL` とparserを確認してください。
