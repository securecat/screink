# jsQR (bundled)

screink decodes QR codes with [jsQR](https://github.com/cozmo/jsQR). A copy lives here so that
the extension carries everything it runs: Manifest V3 forbids executing remotely hosted code, and
screink declares no external hosts at all, so nothing can be fetched at runtime.

| | |
| --- | --- |
| Name | jsQR |
| Version | 1.4.0 |
| Taken from | `dist/jsQR.js` in the npm package `jsqr@1.4.0` |
| Upstream | https://github.com/cozmo/jsQR |
| License | Apache License 2.0 (`LICENSE`, bundled here) |
| sha256 | `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859` |

| File | What it is |
| --- | --- |
| `jsqr.umd.js` | The upstream file as published, byte for byte. Not modified. |
| `index.js` | A small wrapper written for screink, so the above can be imported as an ES module. |
| `LICENSE` | The upstream Apache License 2.0. |

---

# jsQR（同梱）

スクリーンクは QRコードのデコードに [jsQR](https://github.com/cozmo/jsQR) を使っており、
その配布ファイルをここに同梱しています。Manifest V3 はリモートにあるコードの実行を禁じており、
またスクリーンクは外部の通信先を一切宣言していないため、実行時に何かを取ってくることはできません。
拡張が動くために必要なものは、すべて拡張の中にあります。

| | |
| --- | --- |
| 名前 | jsQR |
| バージョン | 1.4.0 |
| 取得元 | npm パッケージ `jsqr@1.4.0` の `dist/jsQR.js` |
| upstream | https://github.com/cozmo/jsQR |
| ライセンス | Apache License 2.0（`LICENSE` を同梱） |
| sha256 | `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859` |

| ファイル | 内容 |
| --- | --- |
| `jsqr.umd.js` | upstream の配布ファイルそのまま。1バイトも変更していません。 |
| `index.js` | 上記を ES モジュールとして読み込むための、スクリーンク側の薄いラッパー。 |
| `LICENSE` | upstream の Apache License 2.0。 |
