# temochiz潮時表 仕様書

この文書は、`temochiz潮時表` の開発・保守・引き継ぎ用メモです。利用者向けの説明は [README.md](README.md) を参照してください。

## 概要

`temochiz潮時表` は、釣り用にスマートフォンで潮位を確認するための静的Webアプリです。

2026年分の潮位データをリポジトリ内に持ち、ブラウザ上で地点・日付を選ぶだけで、以下を表示します。

- 次の満潮・干潮
- その日の満潮・干潮一覧
- 潮回りと概算月齢
- 24時間タイドグラフ
- 釣りのチャンスタイム
- 今日の日付の場合のみ、現在時刻の位置

GitHub Pages 上で静的ファイルだけで動作します。通常の閲覧時に気象庁へ直接アクセスしません。

## 使っている技術

| 項目 | 内容 |
| --- | --- |
| フロントエンド | HTML / CSS / Vanilla JavaScript |
| グラフ描画 | JavaScriptでSVGを生成 |
| データ | 気象庁の潮位表テキストをJSON化し、さらに`file://`対応用のJSとして同梱 |
| PWA | `manifest.webmanifest` と `sw.js` |
| 公開 | GitHub Pages / GitHub Actions |
| テスト | Node.js標準の `node --test` |
| ライセンス | MIT License |

## アプリの起動フロー

1. `index.html` が読み込まれる。
2. 初期表示用に `data/2026/TK.js` が先に読み込まれる。
3. `js/tide-graph.js` がSVGグラフ描画関数を `window.renderTideGraph` として登録する。
4. `js/data.js` が地点一覧と年次データ読み込み関数を `window.TideGraphData` として登録する。
5. `js/app.js` が起動し、URLパラメータ・localStorage・今日の日付をもとに初期状態を作る。
6. 地点一覧を読み込み、地域ごとの `<optgroup>` として選択ボックスを構築する。
7. 選択中の地点・日付に対応する年次データを読み込む。
8. その日の潮位データを取り出し、満潮・干潮、潮回り、チャンスタイム、グラフを描画する。
9. 今日の日付を表示している場合のみ、1分ごとに再描画して現在時刻の位置を更新する。

ページ全体の自動リロードは行いません。現在時刻表示は内部の再描画で更新します。

## 画面更新の流れ

### 地点を変更した場合

1. `stationSelect` の `change` イベントが発火する。
2. 選択地点を `state.station` に反映する。
3. `localStorage.lastStation` に地点コードを保存する。
4. URLの `stn` パラメータを更新する。
5. `state.yearData` を破棄する。
6. 新しい地点の年次データを読み込んで再描画する。

### 日付を変更した場合

1. `dateInput` の `change` イベントが発火する。
2. `state.dateKey` を更新する。
3. URLの `date` パラメータを更新する。
4. 同じ地点・同じ年のデータがすでに読み込まれていれば、データ再取得なしで即再描画する。
5. 別年などで未読み込みの場合は、年次データを読み込んで再描画する。

2026年分を地点ごとに丸ごと持つため、同じ地点内の日付切り替えは高速です。

## データ読み込みの仕組み

データは2種類の形式で持っています。

| 形式 | 用途 |
| --- | --- |
| `data/2026/{code}.json` | 元データに近い保存形式。HTTP環境でのfallbackにも使う |
| `data/2026/{code}.js` | `file://` でも読める同梱データ。`window.TIDEGRAPH_PRELOADED_DATA` に登録する |

`file://` ではブラウザによってJSONの `fetch()` が制限されるため、地点データはJSファイルとして動的に読み込めるようにしています。

`js/data.js` の `loadYearData(year, stationCode)` は以下の順でデータを探します。

1. すでに `window.TIDEGRAPH_PRELOADED_DATA` にあるか確認する。
2. なければ `data/{year}/{station}.js` を `<script>` として追加読み込みする。
3. それでもなければ、HTTP環境の場合だけ `data/{year}/{station}.json` を `fetch()` する。
4. `file://` でデータがなければエラーにする。

## 潮位データの構造

各地点のJSONはおおむね以下の形です。

```json
{
  "station": {
    "code": "TK",
    "name": "東京"
  },
  "year": 2026,
  "unit": "cm",
  "source": "JMA tide table",
  "sourceUrl": "https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt/2026/TK.txt",
  "generatedAt": "2026-08-11T...",
  "scriptVersion": "0.1.0",
  "days": {
    "2026-08-12": {
      "hourly": [135, 154, "..."],
      "highs": [{ "time": "03:51", "level": 198 }],
      "lows": [{ "time": "10:46", "level": 13 }]
    }
  }
}
```

`hourly` は0時から23時までの24個の潮位です。単位はcmです。

## グラフ描画

グラフ描画は `js/tide-graph.js` が担当します。

主な描画要素は以下です。

- SVG全体
- 3時間刻みの縦グリッド
- 潮位目盛り
- 潮位折れ線
- 毎時潮位のタップ可能な点
- 満潮・干潮マーカー
- チャンスタイム背景帯
- 今日だけ表示する現在時刻マーカー

現在時刻マーカーは、チャンスタイムと混同しないように以下の構成です。

- 背景帯: 紫
- 中心線: 赤オレンジ
- 「現在」ラベル: 赤オレンジ背景

## チャンスタイム判定

チャンスタイムは `js/app.js` の `buildFishingChanceWindows(day)` で計算します。

現在の仕様は以下です。

- 干潮から満潮へ向かう区間: 上げ三分付近
- 満潮から干潮へ向かう区間: 下げ七分付近
- 各チャンス中心時刻の前後約0.45時間を背景帯で表示

これは釣り向けの目安表示であり、釣果を保証するものではありません。

## 潮回り判定

潮回りは `js/app.js` の `buildTideInfoText(dateKey)` で表示します。

月齢は既知の新月日時を基準に概算し、以下のように分類します。

- 大潮
- 中潮
- 小潮
- 長潮
- 若潮

厳密な暦計算ではなく、アプリ上の目安表示です。

## PWAとキャッシュ

PWA関連ファイルは以下です。

- `manifest.webmanifest`
- `sw.js`
- `icons/icon-192.png`
- `icons/icon-512.png`

`sw.js` はアプリ本体、地点一覧、2026年の各地点JSデータ、アイコンをprecacheします。

キャッシュを更新したい場合は、以下を更新します。

- `sw.js` の `CACHE_VERSION`
- `index.html` のCSS/JS参照クエリ
- 必要に応じて `js/data.js` の `DATA_SCRIPT_VERSION`

## ディレクトリ構成

```text
tidegraph/
├─ .github/
│  └─ workflows/
│     └─ pages.yml              GitHub Pages公開用workflow
├─ assets/
│  └─ tidegraph-qr.png          README掲載用QRコード
├─ css/
│  └─ app.css                   画面全体とSVG要素のスタイル
├─ data/
│  ├─ stations.json             地点一覧
│  └─ 2026/
│     ├─ {code}.json            地点ごとの2026年潮位データ
│     └─ {code}.js              file://対応用の同梱データ
├─ icons/
│  ├─ icon-192.png              PWAアイコン
│  └─ icon-512.png              PWAアイコン
├─ js/
│  ├─ app.js                    アプリ状態管理・イベント・表示組み立て
│  ├─ data.js                   地点一覧と年次データ読み込み
│  └─ tide-graph.js             SVGグラフ描画
├─ scripts/
│  └─ import-jma-tides.mjs      気象庁潮位表テキストのJSON変換
├─ tests/
│  └─ import-jma-tides.test.mjs parserテスト
├─ index.html                   アプリ本体HTML
├─ manifest.webmanifest         PWA manifest
├─ sw.js                        Service Worker
├─ README.md                    利用者向け説明
├─ SPEC.md                      この仕様書
├─ LICENSE                      MIT License
└─ package.json                 Node.js scripts定義
```

## 主要ファイルの役割

| ファイル | 役割 |
| --- | --- |
| `index.html` | HTML構造、CSS/JS読み込み、PWA用meta |
| `css/app.css` | レスポンシブUI、グラフ色、現在時刻・チャンスタイム表示 |
| `js/app.js` | アプリの状態管理、イベント処理、潮回り・チャンスタイム計算 |
| `js/data.js` | 地点一覧読み込み、年次データのJS/JSON読み込み |
| `js/tide-graph.js` | SVGグラフ生成 |
| `data/stations.json` | 地域別地点一覧 |
| `data/2026/*.json` | 2026年の地点別潮位データ |
| `data/2026/*.js` | `file://` 対応の地点別潮位データ |
| `scripts/import-jma-tides.mjs` | 気象庁テキストデータの取得・変換 |
| `sw.js` | PWAキャッシュ |
| `.github/workflows/pages.yml` | GitHub Pagesデプロイ |

## 地点一覧

2026年版では、浅く全国をカバーするため、以下の地域グループを持ちます。

- 北海道
- 東北
- 関東
- 中部
- 北陸・日本海
- 西日本
- 九州
- 沖縄

地点の実体は `data/stations.json` と `js/data.js` の `FALLBACK_STATIONS` の両方にあります。

`file://` で `stations.json` を読めない環境でも動かすため、`FALLBACK_STATIONS` も更新が必要です。

## データ更新手順

### 1地点だけ更新する場合

```bash
node scripts/import-jma-tides.mjs --year 2026 --station TK --name 東京
```

出力は `data/2026/TK.json` です。

### `file://` 用JSを作る場合

JSONだけでは `file://` で読めないことがあるため、対応するJSも作ります。

出力形式は以下です。

```js
window.TIDEGRAPH_PRELOADED_DATA = window.TIDEGRAPH_PRELOADED_DATA || {};
window.TIDEGRAPH_PRELOADED_DATA['2026/TK'] = { ...JSON内容... };
```

### 地点を追加する場合

1. 気象庁の地点コードを確認する。
2. `scripts/import-jma-tides.mjs` でJSONを作る。
3. 対応する `{code}.js` を作る。
4. `data/stations.json` に追加する。
5. `js/data.js` の `FALLBACK_STATIONS` に追加する。
6. `sw.js` の `PRECACHE_URLS` に `{code}.js` を追加する。
7. キャッシュバージョンを更新する。
8. テストとブラウザ確認を行う。

## テスト

parserテストは以下で実行します。

```bash
node --test
```

主に以下を検証します。

- 24個の毎時潮位を読めること
- 負の潮位を読めること
- `9999/999` の欠損満干潮を除外できること
- 地点コード不一致を検出できること
- 日付重複を検出できること
- 短い固定長行を検出できること

JS構文確認は以下のように行います。

```bash
node --check js/app.js
node --check js/data.js
node --check js/tide-graph.js
node --check sw.js
```

## 公開

`main` ブランチへpushすると、`.github/workflows/pages.yml` によりGitHub Pagesへデプロイされます。

公開URLは以下です。

[https://temochiz-lab.github.io/tidegraph/](https://temochiz-lab.github.io/tidegraph/)

## 注意事項

- 表示値は予測潮位です。
- 天候、気圧、風、波などによる実際の海面変動は反映しません。
- 安全航行用の装置としては使用しません。
- 潮回りとチャンスタイムはアプリ上の目安表示です。
- 2026年以外のデータを表示するには、該当年のデータ追加が必要です。
