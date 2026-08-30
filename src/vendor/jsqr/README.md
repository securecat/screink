# jsQR (vendored)

QRコードのデコードに使用している同梱ライブラリ。

| | |
| --- | --- |
| 名前 | jsQR |
| バージョン | 1.4.0 |
| 取得元 | npm パッケージ `jsqr@1.4.0` の `dist/jsQR.js` |
| upstream | https://github.com/cozmo/jsQR |
| ライセンス | Apache License 2.0（`LICENSE` を同梱） |
| sha256 | `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859` |

## なぜ同梱しているか

- Manifest V3 はリモートコードの実行を禁止しているため、CDN からの読み込みができない
- screink は外部への通信先を一切持たない構成（拡張ページの CSP に `connect-src 'none'`）を維持している

## なぜ `BarcodeDetector` を使わないか

**すべての環境で jsQR を使う。標準 API へのフォールバックは実装していない。**

Chrome 標準の `BarcodeDetector` は、**Windows デスクトップの Chrome 151 では未サポート**である
ことを実測で確認している（`work/e2e/probe-barcode.mjs`。headless / headful、
window / service worker のすべてで `'BarcodeDetector' in self === false`）。

使える環境でだけ標準 API に切り替えると、環境によって読み取りの挙動が変わる。
特に、切り出しを狭い方から広げる探索は「jsQR は画像内に複数コードがあると1つも返さない」
という性質に合わせて設計してあり（仕様書 §4.6）、複数コードを返せる `BarcodeDetector` では
前提が変わる。検証できない分岐を持つより、1つのエンジンに揃える。

## ファイル

| ファイル | 内容 |
| --- | --- |
| `jsqr.umd.js` | upstream の配布ファイルそのまま（**変更禁止**。1バイトも変えていない） |
| `index.js` | ES モジュールとして使うための薄いラッパー（screink 側のコード） |
| `LICENSE` | upstream の Apache License 2.0 |

## 更新手順

```
npm pack jsqr@<version>
tar -xzf jsqr-<version>.tgz
cp package/dist/jsQR.js src/vendor/jsqr/jsqr.umd.js
cp package/LICENSE      src/vendor/jsqr/LICENSE
```

そのうえで、この README のバージョン・sha256 を更新し、E2E スモークテスト
（`work/e2e/run.mjs`）を通すこと。`index.js` は upstream の API が変わらなければ触らなくてよい。

## 既知の制約

- jsQR は 1回の呼び出しで **QRコードを1つしか返さない**（画像全体を走査して最初に見つけたもの）。
  複数のQRコードに対応するため、screink 側では「見つけた領域を塗りつぶして再走査する」ループで
  複数候補を集めている（`src/background/service-worker.js` の `detectQrCodes`）。
- QRコード以外のバーコード（EAN、Code128 など）は扱えない。必要になった段階で
  zxing-wasm 等への差し替えを検討する。
