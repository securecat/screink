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

### [0.2.2] - 2026-08-30

#### Fixed

- Pointing anywhere on a QR code now reads it. Until now it had to be pointed at near its centre, which was easy to miss when codes of different sizes sat side by side. The crop was a square centred on where you pointed: off-centre, it had to grow to reach the far edge of the code, while the size that still excluded the neighbouring code shrank, and sometimes nothing fitted in between. The crop now follows the code itself — the area around your position is scanned for a block of mixed light and dark pixels, which is what a QR code looks like and a margin or a flat panel does not, and the outline of the one under your position is what gets read. Sweeping across three codes of different sizes, readable positions went from 15 of 35 to 32 of 35; the three that remain are points where there is no code.
- The marker showing where you pointed on the debug page was offset by the width of the white border added in 0.2.1.

#### Changed

- Reading is faster, 164–223ms down to 90–119ms on the same sample, because it usually decodes once rather than trying a series of sizes.

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

### [0.2.2] - 2026-08-30

#### 修正

- QRコードの上ならどこを指しても読めるようになりました。これまでは中心の近くを指す必要があり、大きさの異なるコードが並んでいると外しやすい状態でした。切り出しが「指した点を中心とする正方形」だったためです。中心からずれるほど、コード全体を覆うには大きな正方形が必要になり、一方で隣のコードを巻き込まない上限は小さくなるので、その間に収まる大きさが無くなることがありました。切り出しをコード自体に合わせるようにしました。指した位置の周りから、明暗が混在するかたまり（QRコードはそう見えます。余白や単色の面はそう見えません）を探し、指した位置にあるものの輪郭を読み取ります。大きさの異なる3つのコードを横切って調べたところ、読める位置が35箇所中15箇所から32箇所になりました。残る3箇所はコードが無い場所です。
- 目視確認画面で、指した位置を示すマーカーが、0.2.1 で足した白い縁の分だけずれていました。

#### 変更

- 読み取りが速くなりました。同じサンプルで 164〜223ms から 90〜119ms へ。多くの場合、複数の大きさを順に試さずに一度で読み取れるためです。
