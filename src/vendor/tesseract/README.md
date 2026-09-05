# Tesseract.js (bundled)

screink reads text with [Tesseract.js](https://github.com/naptha/tesseract.js) and the Tesseract
OCR engine compiled to WebAssembly. Copies live here so that the extension carries everything it
runs: Manifest V3 forbids executing remotely hosted code, and screink declares no external hosts at
all, so nothing can be fetched from the network at runtime.

Only the English model is bundled. URLs are written in ASCII, which is what screink looks for.

| File | What it is | Version | Taken from | sha256 |
| --- | --- | --- | --- | --- |
| `tesseract.min.js` | The Tesseract.js API | 7.0.0 | `dist/tesseract.min.js` in the npm package `tesseract.js@7.0.0` | `000c27d9cd0def655f77b36c72a389c0ab13793aa31cb4d7aab56d09c0afbc7e` |
| `worker.min.js` | The worker Tesseract.js runs the engine in | 7.0.0 | `dist/worker.min.js` in the same package | `576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d` |
| `tesseract-core-simd-lstm.js` | Loader for the engine below | 6.1.2 | npm package `tesseract.js-core@6.1.2` | `be3504705d7111d1d1f3f7f9dff326c26d334031ede36e31c4d3cf883027e982` |
| `tesseract-core-simd-lstm.wasm` | The OCR engine itself, LSTM only | 6.1.2 | the same package | `187d76742dfc0d8929f0b49a619f145bb6370730776c7bd0d3e20c6b2098808d` |
| `tessdata/eng.traineddata.gz` | The English model | 4.0.0 (integerized) | `4.0.0_best_int/eng.traineddata.gz` in the npm package `@tesseract.js-data/eng@1.0.0` | `45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91` |

Every one of these is the upstream file as published, byte for byte. None is modified.

## Licenses

- Tesseract.js — Apache License 2.0 (`LICENSE-tesseract.js.md`)
- The engine, `tesseract.js-core` — Apache License 2.0 (`LICENSE-tesseract.js-core`)
- The English model — published in the npm package `@tesseract.js-data/eng` under the MIT license;
  the model data itself comes from the Tesseract project and is Apache License 2.0. That license
  text is the one in `LICENSE-tesseract.js-core`.

---

# Tesseract.js（同梱）

スクリーンクは文字の読み取りに [Tesseract.js](https://github.com/naptha/tesseract.js) と、
WebAssembly に移植された Tesseract OCR エンジンを使っており、その配布ファイルをここに同梱しています。
Manifest V3 はリモートにあるコードの実行を禁じており、またスクリーンクは外部の通信先を
一切宣言していないため、実行時にネットワークから何かを取ってくることはできません。
拡張が動くために必要なものは、すべて拡張の中にあります。

同梱しているのは英語のモデルだけです。スクリーンクが探すURLはASCIIで書かれるためです。

| ファイル | 内容 | バージョン | 取得元 | sha256 |
| --- | --- | --- | --- | --- |
| `tesseract.min.js` | Tesseract.js の API | 7.0.0 | npm パッケージ `tesseract.js@7.0.0` の `dist/tesseract.min.js` | `000c27d9cd0def655f77b36c72a389c0ab13793aa31cb4d7aab56d09c0afbc7e` |
| `worker.min.js` | Tesseract.js がエンジンを動かす Worker | 7.0.0 | 同パッケージの `dist/worker.min.js` | `576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d` |
| `tesseract-core-simd-lstm.js` | 下のエンジンの読み込み役 | 6.1.2 | npm パッケージ `tesseract.js-core@6.1.2` | `be3504705d7111d1d1f3f7f9dff326c26d334031ede36e31c4d3cf883027e982` |
| `tesseract-core-simd-lstm.wasm` | OCR エンジン本体（LSTM のみ） | 6.1.2 | 同パッケージ | `187d76742dfc0d8929f0b49a619f145bb6370730776c7bd0d3e20c6b2098808d` |
| `tessdata/eng.traineddata.gz` | 英語のモデル | 4.0.0（整数化） | npm パッケージ `@tesseract.js-data/eng@1.0.0` の `4.0.0_best_int/eng.traineddata.gz` | `45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91` |

いずれも upstream の配布ファイルそのままで、1バイトも変更していません。

## ライセンス

- Tesseract.js — Apache License 2.0（`LICENSE-tesseract.js.md`）
- エンジン `tesseract.js-core` — Apache License 2.0（`LICENSE-tesseract.js-core`）
- 英語のモデル — npm パッケージ `@tesseract.js-data/eng` としては MIT ライセンスで配布されていますが、
  モデルのデータ自体は Tesseract プロジェクト由来で Apache License 2.0 です。
  そのライセンス本文は `LICENSE-tesseract.js-core` と同じものです。
