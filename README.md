# screink

**Turn URLs and QR codes shown in a shared screen into something you can actually click.**

> Note: The Japanese name of this extension is "スクリーンク" (Screenk). "screink" is its alphabetic name.

## What is this?

When you join a meeting through your browser — Microsoft Teams, Google Meet, Zoom — anything a participant shares on screen arrives as *video*. So even when a slide shows a URL or a QR code, there is nothing to click.

You have probably seen how this ends. "Please fill in the survey here" appears as a QR code, and every remote participant reaches for their phone to photograph their own monitor, then sends the URL from the phone back to the PC they were sitting at the whole time.

screink removes that detour. You point at the spot on screen where the URL or QR code is, and screink reads it and opens it in a new tab.

## How it works

1. Enter **aim mode** — from the toolbar icon or a keyboard shortcut
2. Point at the URL or QR code — click it, or move the crosshair with the arrow keys
3. screink captures a small region around that point
4. It decodes the QR code, or runs OCR to pull out the URL — all inside your browser
5. You confirm what it found, and it opens in a new tab

screink never relies on the internals of any particular meeting service. The only things it works from are the pixels visible on screen and the position you pointed at. That is what lets one implementation cover Teams, Meet, Zoom, and any other page.

## Development status

**This is a proof of concept. It is not ready for everyday use yet.**

QR codes work end to end. URLs shown as text do not — that needs OCR, which is next.

| Phase | Goal | Status |
| --- | --- | --- |
| 0 | Aim mode, region capture, and QR code decoding | Done |
| 1 | OCR for URLs shown as text | Next |
| 2 | Accuracy under realistic screen-sharing conditions | Planned |
| 3 | Compatibility survey: Teams, Zoom, Google Meet | Planned |

A QR code needs to be about 48 device pixels across to be readable. On a high-DPI display that is roughly 24 CSS pixels, so codes that look small on screen usually still work.

## Installation

### Chrome Web Store

(Coming soon)

### Developer Mode (Manual Install)

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked** and select the repository folder

## Usage

1. Open the page where the screen is being shared
2. Click the screink toolbar icon, or press `Alt` + `Shift` + `S`, to enter aim mode
3. Point at the URL or QR code
   - Click it, or
   - Move the crosshair with the arrow keys and press `Enter`
4. Check the URL screink found, and open it
5. Press `Esc` at any time to leave aim mode

Ordinary clicks are never intercepted. screink only takes over the click while aim mode is on, so it cannot interfere with the meeting UI underneath.

## Privacy

- **Everything happens inside your browser.** No image and no URL is ever sent anywhere.
- **It is built so that sending would not be possible.** The extension declares no external hosts at all, and every library it needs is bundled in this repository.
- **Nothing is stored.** Captured images, recognition results, and where you pointed are all discarded. The only thing saved is your settings.
- **Your screen is not watched.** A single frame is captured at the moment you confirm a position — never continuously.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `activeTab` | To capture one frame of the visible area of the current tab, at the moment you confirm a position |
| `scripting` | To load the aim mode overlay into the current tab, only while you are using it |
| `storage` | To save your settings |

screink requests **no host permissions**, so it has no standing access to any site.

## Bundled third-party code

QR codes are decoded by [jsQR](https://github.com/cozmo/jsQR) (Apache License 2.0), which is bundled in `src/vendor/jsqr/` rather than loaded from a CDN — Manifest V3 forbids remote code, and screink declares no external hosts at all. Chrome's built-in `BarcodeDetector` is used instead where it is available; it is not available on Windows.

## Changelog

Only the latest version is listed here. For the full history, see [CHANGELOG.md](CHANGELOG.md).

### [0.2.0] - 2026-08-28

QR codes now work end to end: point at one and open the URL it carries. URLs shown as text still need OCR, which is not built yet.

#### Added

- QR code decoding. Point at a QR code and screink reads it, shows what it found, and opens it in a new tab on confirmation.
- Confirmation panel that leads with the destination host, so you can see where a code is about to send you before you go there.
- Copying the decoded content, for codes that carry text rather than a URL.
- Debug page now draws the position you pointed at and the outline of every code it decoded on top of the captured image.
- Setting for the size of the area searched for QR codes.

#### Changed

- The search area now widens progressively — a quarter, a half, one and two times the configured size — and stops at the first code it reads. Scanning a wide area first loses codes, because the decoder returns nothing at all when several codes share one image. Starting narrow also matches what you meant: the code you pointed at.
- A decoded code only counts as the one you pointed at if your position falls inside it, or within one code-size of its centre. Widening the search no longer picks up a code on the far side of the screen.
- The crop is a square sized for QR codes, replacing the separate width and height settings. The band shape suited to URL text returns with OCR.

#### Security

- Only `http` and `https` are ever opened. A QR code carrying `javascript:`, `data:`, `chrome://` or `file://` is shown as plain text with no open button.
- The URL is validated again in the service worker immediately before the tab is created, rather than trusting what the page-side script passed along.

---

# screink（スクリーンク）

**画面共有で表示されたURLやQRコードを、クリックできるようにするChrome拡張。**

## これは何？

TeamsやGoogle Meet、Zoomなどをブラウザで使っているとき、参加者が画面共有した資料は「映像」として表示されます。そのため、スライドの中にURLやQRコードが写っていても、クリックできるものは何もありません。

その先に何が起こるかは、たぶん見覚えがあると思います。「アンケートはこちらからお願いします」がQRコードだけで提示され、オンライン参加者は一斉にスマホを取り出して自分のモニタを撮影し、読み取ったURLを、さっきからずっと座っていたPCへ向けて送信する——という間抜けなことになります。

screink は、この回り道をなくします。URLやQRコードが写っている場所を指すだけで、screink がそれを読み取り、新しいタブで開きます。

## しくみ

1. **照準モード**に入る（ツールバーのアイコン、またはショートカットキー）
2. URLやQRコードが写っている場所を指す（クリック、または矢印キーで照準を移動）
3. screink がその周辺だけを画像として切り出す
4. QRコードをデコード、またはOCRでURLを取り出す（すべてブラウザ内で処理）
5. 認識した内容を確認して、新しいタブで開く

screink は、特定の会議サービスの内部構造に依存しません。手がかりにするのは「画面に見えているピクセル」と「あなたが指した位置」だけです。だからこそ、ひとつの実装で Teams でも Meet でも Zoom でも、その他のどんなページでも動きます。

## 開発状況

**現在はPoC（技術検証）段階です。まだ日常的に使える状態ではありません。**

QRコードは端から端まで動きます。文字として表示されたURLはまだ読めません。そちらにはOCRが必要で、次の課題です。

| フェーズ | 目的 | 状況 |
| --- | --- | --- |
| 0 | 照準モード・領域の切り出し・QRコードのデコード | 完了 |
| 1 | 文字として表示されたURLのOCR | 次 |
| 2 | 実際の画面共有に近い条件での精度検証 | 予定 |
| 3 | Teams・Zoom・Google Meet の適応性調査 | 予定 |

QRコードは、画面上で約48デバイスピクセルの大きさがあれば読めます。高DPIのディスプレイならCSSピクセルで約24px相当なので、見た目に小さいコードでもたいてい読めます。

## インストール

### Chrome ウェブストア

準備中

### デベロッパーモード（手動インストール）

1. このリポジトリをダウンロードまたはクローン
2. Chromeで `chrome://extensions` を開く
3. 右上の **デベロッパーモード** を有効にする
4. **パッケージ化されていない拡張機能を読み込む** をクリックし、リポジトリのフォルダを選択

## 使い方

1. 画面共有が表示されているページを開く
2. screink のツールバーアイコンをクリック、または `Alt` + `Shift` + `S` を押して照準モードに入る
3. URLやQRコードが写っている場所を指す
   - クリックする、または
   - 矢印キーで照準を動かして `Enter` を押す
4. screink が見つけたURLを確認して開く
5. `Esc` を押せばいつでも照準モードを解除できます

通常のクリックを奪うことはありません。screink がクリックを受け取るのは照準モード中だけなので、その下にある会議UIの操作を妨げません。

## プライバシー

- **すべての処理がブラウザ内で完結します。** 画像もURLも、どこにも送信されません。
- **そもそも送信できない構造にしています。** 拡張は外部ホストを一切宣言しておらず、必要なライブラリはすべてこのリポジトリに同梱されています。
- **何も保存しません。** 切り出した画像・認識結果・指した位置は、いずれも破棄されます。保存されるのは設定だけです。
- **画面を監視しません。** 画面を取得するのは、あなたが位置を確定した瞬間の1枚だけです。常時取得は行いません。

## 権限について

| 権限 | 必要な理由 |
| --- | --- |
| `activeTab` | 位置を確定した瞬間に、表示中のタブの見えている範囲を1枚取得するため |
| `scripting` | 照準モードのUIを、使用中のあいだだけ表示中のタブに読み込むため |
| `storage` | 設定を保存するため |

screink は**ホスト権限を一切要求しません**。そのため、どのサイトに対しても常時アクセス権を持ちません。

## 同梱しているサードパーティのコード

QRコードのデコードには [jsQR](https://github.com/cozmo/jsQR)（Apache License 2.0）を使用しており、CDNから読み込むのではなく `src/vendor/jsqr/` に同梱しています。Manifest V3 がリモートコードの実行を禁じていることに加え、screink が外部への通信先を一切持たない構成を保つためです。Chrome 標準の `BarcodeDetector` が使える環境ではそちらを使いますが、Windows では利用できません。

## 更新履歴

ここには最新バージョンのみを記載しています。全履歴は [CHANGELOG.md](CHANGELOG.md) を参照してください。

### [0.2.0] - 2026-08-28

QRコードが端から端まで動くようになりました。指せば、そのURLが開けます。文字として表示されたURLはOCRが必要で、そちらはまだありません。

#### 追加

- QRコードのデコード。QRコードを指すと screink がそれを読み取り、内容を提示し、確認のうえ新しいタブで開きます。
- 開く先のホスト名を先頭に大きく出す確認パネル。そのコードがどこへ連れて行こうとしているのかを、行く前に確認できます。
- 読み取った内容のコピー。URLではなくテキストを持つコードのためのものです。
- デバッグ画面が、切り出した画像の上に、指した位置と読み取ったすべてのコードの枠を重ねて表示するようになりました。
- QRコードを探す範囲の大きさを変える設定。

#### 変更

- 探す範囲を、設定値の 1/4・1/2・等倍・2倍と段階的に広げ、最初に読めたところで止めるようにしました。広い範囲から探すとかえって読めません。デコーダは1枚の画像に複数のコードが写っていると1つも返さないためです。狭い範囲から始めることは「指したコードを読む」という意図にも一致します。
- 読み取ったコードを「指したもの」と見なす条件を、指した位置がその中にあるか、中心から1コード分以内にあること、としました。範囲を広げても、画面の反対側にあるコードを拾わなくなります。
- 切り出しを、QRコードに合わせた正方形にしました（幅と高さの個別設定を置き換え）。URLの文字列に適した横長の帯は、OCRとともに戻ってきます。

#### セキュリティ

- 開くのは `http` と `https` だけです。`javascript:` `data:` `chrome://` `file://` を持つQRコードは、テキストとして提示するだけで開くボタンを出しません。
- タブを作る直前に、service worker 側でURLをもう一度検証します。ページ側のスクリプトから渡された内容を信用しません。
