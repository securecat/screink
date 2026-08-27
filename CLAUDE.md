# screink — プロジェクト固有ルール

グローバルの `~/.claude/CLAUDE.md`（および `REPOSITORY.md` / `CHROME_EXTENSION.md` / `A11Y.md`）を前提とした追補。
ここにはこのプロジェクト固有の事項のみを書く。一般ルールは繰り返さない。

---

## 仕様書

**唯一の仕様書は [`work/screen-shared-url-clickable-poc-spec.md`](work/screen-shared-url-clickable-poc-spec.md) である。**

- 何を作るか・なぜその方式か・どのフェーズで何をやるか・どう評価するか → すべて仕様書
- どう書くか（コーディング規約・実装時のチェックリスト） → このファイル

**実装作業に入る前に必ず仕様書を読むこと。** 仕様と実装の判断が食い違った場合は仕様書を更新する。
このファイルに仕様を書き写さない（二重管理を避けるため）。

`work/` は gitignore 済みのため、仕様書はローカルにのみ存在する。

---

## リポジトリの状態

- 公開状態：**Public**
  - → コミットメッセージは**英語**
  - → README.md / CHANGELOG.md は**英語セクション → `---` → 日本語セクション**
- 拡張の表示名：`screink`（日本語での呼称は「スクリーンク」）

## バージョン番号の記載箇所

バージョンを上げるときは以下の3か所すべてを更新する。

1. `manifest.json` の `version`
2. `CHANGELOG.md`（全履歴）
3. `README.md`（最新バージョンのみ・英日両セクション）

PoC 期間中は `0.x.y` を使う。`1.0.0` は Chrome ウェブストア公開時とする。

## UI の言語

現時点では **UI テキストは日本語のみ**（`_locales` による i18n は未対応）。
`lang="ja"` で書くため、A11Y.md の規定により**本文・注釈とも最小 16px**。

- **TODO**: ストア公開を目指す段階で `_locales/` + `chrome.i18n` による英日対応を入れる。
  そのタイミングで `manifest.json` の `name` / `description` / `commands.description` も `__MSG_*__` へ置き換える。
- `manifest.json` の `description` は現時点では英語（ストア/リポジトリ上の一次表示が英語圏向けのため）。

---

## ディレクトリ構成

CHROME_EXTENSION.md の規定構成に、このプロジェクト固有のものを追加している。

```
/
├── icons/
├── src/
│   ├── background/   # service worker（照準モードの注入・画面キャプチャ・切り出し）
│   ├── content/      # 照準モードのオーバーレイUI（動的注入）
│   ├── debug/        # PoC の目視確認用の拡張ページ
│   ├── options/
│   ├── popup/
│   └── shared/       # 設定の既定値・拡張ページ共通CSS
├── promotion/
└── work/             # gitignore 済み。仕様書・PoC の実験・テスト素材置き場
```

---

## 実装時のチェックリスト

仕様書の設計原則を、コードを書くときに踏み外さないための確認事項。
**理由と背景は仕様書側にある。ここは「守ること」だけを列挙する。**

### 構造（仕様書 §8.1・§11・§4.2）

- [ ] 会議サービス固有の DOM 構造・セレクタに依存したコードを書いていない
- [ ] `host_permissions` を追加していない。静的 `content_scripts` を宣言していない
- [ ] `manifest.json` に外部ホストを書いていない
- [ ] 拡張ページの CSP の **`connect-src 'none'` を弱めていない**
  - この制約により `fetch()` は一切使えない。data URL の復号は `atob()` + `Uint8Array` + `Blob` で行う
    （`src/background/service-worker.js` 参照）
  - Tesseract.js 等の導入で `wasm-unsafe-eval` の追加は許容するが、`connect-src` は緩めない
- [ ] 依存ライブラリをリポジトリ内に同梱している（CDN 参照をしていない）
- [ ] 切り出した画像・認識結果・指定位置の履歴を永続化していない
      （`chrome.storage` に入れるのは設定のみ。直近の結果は service worker のメモリ上だけ）
- [ ] 画面キャプチャは、ユーザーが位置を確定した1回につき1枚だけ

### 座標系（仕様書 §4.3）

このプロジェクトのバグの大半はここから出る。**座標を扱う関数には必ず単位をコメントで明記する。**

- [ ] CSS ピクセル（`clientX` / `clientY`）と物理ピクセル（キャプチャ画像）を混同していない
- [ ] `devicePixelRatio` をハードコードせず、毎回読み直している
- [ ] キャプチャ要求の前にオーバーレイを `display: none` で退避し、フレーム待ちを入れている
      （`visibility: hidden` ＋2フレームでは写り込む）
- [ ] オーバーレイの挿入先を `document.fullscreenElement` で切り替えている
- [ ] iframe は当面 top frame のみ（`allFrames: false`）

### ページ側 CSP・Trusted Types（仕様書 §4.4）

- [ ] スタイルは `chrome.scripting.insertCSS` で注入している（`<style>` 要素・`style` 属性を作っていない）
- [ ] 要素の位置・サイズは `element.style.left = ...`（CSSOM）で書いている
- [ ] `innerHTML` を使わず `createElement` / `textContent` で DOM を組んでいる
- [ ] 画像処理を content script ではなく service worker で行っている
- [ ] 切り出した画像の表示を拡張ページ（`src/debug/`）で行っている
      （ページ内オーバーレイにはテキストのみ）

Shadow DOM は使っていない。`insertCSS` は Shadow DOM の中へ届かないため、
`all: initial` によるリセットとクラス名の接頭辞（`screink-`）でページ側スタイルの影響を抑えている。

### 検証（仕様書 §17）

- [ ] 各フェーズの完了時に、実機（実際の Chrome）での動作確認をしている
- [ ] 座標に関わる変更をしたら、デバイス倍率 1 / 1.5 / 2 で E2E スモークテスト（`work/e2e/`）を通している

```
node --experimental-websocket --no-warnings work/e2e/run.mjs [倍率]
```

Chrome 151 では `--load-extension` が機能しないため、このテストは CDP の
`Extensions.loadUnpacked`（`--enable-unsafe-extension-debugging` が必要）で拡張を読み込んでいる。
