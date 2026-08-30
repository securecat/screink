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

**英語と日本語の2言語。`_locales/{en,ja}/messages.json` に置く。既定は英語。**

- 表示文字列をソースに直接書かない。拡張ページは `data-i18n` 属性、
  content script と JS からは `chrome.i18n.getMessage` を使う
- **拡張ページの HTML には既定言語（英語）の文言を直書きし、それを実行時に差し替える。**
  空要素にして実行時に埋める方式は採らない（スクリプトが動かないと何も読めないページになる）
- `lang` 属性は `localizePage()` が実際の表示言語に合わせる
- 文字サイズは両言語とも 16px 以上にする
  （A11Y.md の日本語の下限に合わせておけば英語の下限も満たす）
- 文中にキー表示（`<kbd>`）を差し込む文を作らない。言語で語順が変わり翻訳できなくなる。
  キーと説明は別の要素に分ける
- 英日でキーが一致していることを確認する（`work/e2e` のテストが辞書を引くため、
  片方に無いキーがあれば落ちる）
- `manifest.json` の `name` / `description` / `commands.description` は `__MSG_*__` を使う

---

## ディレクトリ構成

CHROME_EXTENSION.md の規定構成に、このプロジェクト固有のものを追加している。

```
/
├── _locales/         # en / ja の messages.json
├── icons/
├── src/
│   ├── background/   # service worker（照準モードの注入・画面キャプチャ・切り出し・認識）
│   ├── content/      # 照準モードのオーバーレイUI（動的注入）
│   ├── debug/        # 読み取った画像の確認画面
│   ├── options/
│   ├── popup/
│   ├── shared/       # 設定・URL検証・i18n・拡張ページ共通CSS
│   └── vendor/       # 同梱ライブラリ（jsQR）
├── promotion/        # ストア掲載用の素材
└── work/             # gitignore 済み。仕様書・実験・テスト素材置き場
```

同梱ライブラリを追加・更新するときは `src/vendor/<name>/README.md` に
バージョン・取得元・ライセンス・sha256・更新手順を記録すること。
**upstream の配布ファイルは1バイトも変更しない**（差し替えを機械的に行えるようにするため）。
ES モジュールとして使うためのラッパーが必要なら、別ファイルに分けて置く。

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
- [ ] 設定の保存に `chrome.storage.local` を使っている
      （`sync` は Google アカウント経由で端末外へ出るため使わない。PRIVACY.md の記述に関わる）
- [ ] 画面キャプチャは、ユーザーが位置を確定した1回につき1枚だけ
- [ ] 権限を増やしていない（`activeTab` / `scripting` / `storage` の3つのみ）

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

### 危険なURLを開かせない（仕様書 §5.2・§6.1）

- [ ] 認識結果を URL として扱う前に `src/shared/url.js` の `toSafeUrl()` を通している
- [ ] `toSafeUrl()` の許可スキームに `http:` / `https:` 以外を足していない
- [ ] タブを開く直前に service worker 側でも再検証している
      （content script から渡された文字列を信用しない）

### 検証（仕様書 §17）

- [ ] 各フェーズの完了時に、実機（実際の Chrome）での動作確認をしている
- [ ] 座標や認識に関わる変更をしたら、デバイス倍率 1 / 1.5 / 2 で E2E スモークテストを通している

```
node --experimental-websocket --no-warnings work/e2e/run.mjs    [倍率]  # 照準モードと座標変換
node --experimental-websocket --no-warnings work/e2e/run-qr.mjs [倍率]  # QR認識と確認UI
```

その他の計測用スクリプト：

```
node --experimental-websocket --no-warnings work/e2e/qr-size-sweep.mjs  [倍率]  # 読める最小サイズ
node --experimental-websocket --no-warnings work/e2e/probe-barcode.mjs  [headful]  # BarcodeDetector の可否
```

Chrome 151 では `--load-extension` が機能しないため、これらは CDP の
`Extensions.loadUnpacked`（`--enable-unsafe-extension-debugging` が必要）で拡張を読み込んでいる。
また、読み込み直後は service worker に拡張APIのバインディングがまだ入っていないため、
`chrome.tabs` が使えるようになるまで待ってから操作すること（ハーネス側で対応済み）。
