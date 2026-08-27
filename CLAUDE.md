# screink — プロジェクト固有ルール

グローバルの `~/.claude/CLAUDE.md`（および `REPOSITORY.md` / `CHROME_EXTENSION.md` / `A11Y.md`）を前提とした追補。
ここにはこのプロジェクト固有の事項のみを書く。一般ルールは繰り返さない。

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
└── work/             # gitignore 済み。PoC の実験・テスト素材置き場
```

---

## アーキテクチャの原則

仕様書（`work/screen-shared-url-clickable-poc-spec.md`）11章の原則を実装レベルに落としたもの。

### 会議サービス固有の DOM に依存しない

Teams / Zoom / Meet の DOM 構造・セレクタに依存したコードを書かない。
手がかりは「画面に見えているピクセル」と「ユーザーが指した座標」だけに限る。

サービスごとの差分が必要になった場合は Service Adapter として分離し、
Interaction Engine（座標 → 画像取得 → 認識 → URL）側には持ち込まない。

### ネットワーク送信を「できない構造」にする

プライバシー上の中核。単に「送信しない」ではなく、**送信できない**ことを構造で保証する。

- `manifest.json` に外部ホストを一切書かない（`host_permissions` なし・CSP に外部オリジンを許可しない）
- 拡張ページの CSP に **`connect-src 'none'`** を指定している。これは監査可能な形での
  「送信できない」の表明。**この宣言を弱めないこと。**
  - 副作用として `fetch()` が一切使えない。data URL の復号にも使えないため、
    `atob()` + `Uint8Array` + `Blob` で処理している（`src/background/service-worker.js` 参照）
  - Tesseract.js 等を導入する際も、`.wasm` / 学習データは同梱ファイルから読む。
    CSP に `wasm-unsafe-eval` の追加は必要になるが、`connect-src` は緩めない
- 依存ライブラリはすべてリポジトリ内に同梱する（MV3 はリモートコード実行が禁止のため必須でもある）
- OCR / QR デコードはすべてブラウザ内で完結させる。外部 OCR API は候補にしない
- 切り出した画像・認識結果・クリック履歴を永続保存しない（`chrome.storage` に入れるのは設定のみ）
  - 直近の切り出し結果は service worker のメモリ上にのみ保持する（PoC の目視確認用）

### 権限は最小限・常時実行しない

- `host_permissions` は要求しない。`activeTab` + `chrome.scripting.executeScript` により、
  **照準モードに入った瞬間だけ**オーバーレイを注入する（静的 `content_scripts` を宣言しない）
- 画面キャプチャは、ユーザーが位置を確定した1回につき1枚だけ
- 画面の常時監視・常時 OCR は行わない

---

## 座標系の扱い（最重要の実装上の注意）

このプロジェクトのバグの大半はここから出る。座標を扱う関数には必ず単位をコメントで明記する。

- クリック座標（`clientX` / `clientY`）は **CSS ピクセル**・ビューポート基準
- `chrome.tabs.captureVisibleTab()` が返す画像は **物理ピクセル**（= CSS px × `devicePixelRatio`）
- `devicePixelRatio` は OS のディスプレイ倍率と**Chrome のページズームの両方**を含む。
  高 DPI 環境やズーム時に必ずズレるため、ハードコードせず毎回読み直す
- CSS の `transform` / `scale` / `object-fit` は Phase 3（`<video>` 直接読み取り）で初めて問題になる。
  `captureVisibleTab` 方式では最終的な描画結果が撮れるので考慮不要

### キャプチャ前にオーバーレイを隠す

`captureVisibleTab` は自分のオーバーレイも一緒に写す。
キャプチャ要求の前に照準UIを非表示にし、画像取得後に戻す。

### フルスクリーン表示中のオーバーレイ

共有画面がフルスクリーン表示されている場合、オーバーレイは
**fullscreen 要素の子孫に append しないと表示されない**。`document.fullscreenElement` を見て挿入先を切り替える。

### iframe

Teams / Zoom の Web クライアントは iframe 構成。
現在の実装は **top frame のみ**（`allFrames: false`）で、iframe 内の座標変換は未対応。
`captureVisibleTab` はトップレベルのビューポート画像を返すため、
iframe 内で照準を出す場合は iframe のオフセット分の座標変換が必要になる。Phase 3 の調査項目。

---

## ページ側 CSP との付き合い方

会議サービスのページは CSP が厳しい。content script はページの CSP に縛られる場面があるため、
以下を守ること。破ると「Teams だけで動かない」類のバグになる。

| やること | 理由 |
| --- | --- |
| スタイルは `chrome.scripting.insertCSS` で注入する | 拡張が注入したスタイルシートはページの `style-src` の対象外。content script が作った `<style>` 要素や `style` 属性は対象になる |
| 要素の位置・サイズは `element.style.left = ...` で書く | CSSOM 経由の書き込みは CSP の対象外（`style` 属性のパースとは別扱い） |
| DOM は `createElement` / `textContent` で組む。`innerHTML` を使わない | Trusted Types（`require-trusted-types-for 'script'`）を強制しているページでは `innerHTML` への代入が例外になる |
| 画像処理は service worker 側で行う | content script で `<img src="data:...">` や canvas を扱うとページの `img-src` に縛られる。service worker は拡張自身の CSP 下 |
| 切り出した画像の表示は拡張ページ（`src/debug/`）で行う | 同上。ページ内オーバーレイにはテキストだけを出す |

なお、Shadow DOM は使っていない。`insertCSS` は Shadow DOM の中へ届かないため、
`all: initial` によるリセットとクラス名の接頭辞（`screink-`）でページ側スタイルの影響を抑えている。

---

## PoC の方針（仕様書からの変更点）

`work/screen-shared-url-clickable-poc-spec.md` に対し、実装では以下の順序・方式を採る。

### QR コードを OCR より先にやる

QR は誤り訂正が規格に内蔵されており、デコードできれば結果は正解。bounding box も4隅の座標で得られる。
そのため「画像取得 → 座標判定 → 確認UI → 新規タブ」という骨格を、
**認識精度の不確実性ゼロで**検証できる。OCR はこの骨格が通ってから差す。

- `BarcodeDetector`（Chrome 標準 API）は **Windows デスクトップでは未サポートの可能性が高い**。
  利用可能なら使い、なければ同梱ライブラリ（jsQR 等）へフォールバックする構成にする

### 起動トリガーは「照準モード」

素のクリックをトリガーにしない。会議サービス側のクリックハンドラ（ピン留め・全画面化）と衝突するため。

- 拡張アイコン、またはショートカットキーで照準モードに入る
- 照準モード中のみ、クリックを capture phase で奪う（`preventDefault` + `stopPropagation`）
- 照準モード中は矢印キー + Enter でも位置を指定できる（マウス不要 = A11Y 上も有利）
- Esc で解除。認識が終わったら自動で通常状態へ戻る
- モード中であることは常に画面上に明示する

### 切り出し領域は形を用途で変える

- **OCR 用**：URL は横に長く縦に薄いため、**横に広く縦に狭い帯**にする（正方形寄りの矩形は相性が悪い）
- **QR 用**：QR は縦横比 1:1 なので**正方形寄り**にする

### OCR は英語モデルのみ

URL 自体は ASCII なので `eng` で足りる。`jpn` は学習データが十数MB級で読み込みも遅く、
URL の認識精度には寄与しない。日本語 OCR は将来の拡張（一般テキスト認識）側の課題とする。

前処理（2〜3倍アップスケール + グレースケール + コントラスト強調）は最初から入れる。
素の画像で精度を測ると「OCR では無理」と誤判断しかねない。

### 精度の評価指標

確認UIを前提にする設計なので、「検出成功率」ではなく以下で測る。

- 候補の中に正解 URL が入っていた率（recall）
- 提示された候補からユーザーが正解を選べた率

誤検出は確認UIが吸収するため、recall 寄りの指標にする。
