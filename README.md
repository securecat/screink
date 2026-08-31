# screink

## Overview

When you join a meeting through your browser — Microsoft Teams, Google Meet, Zoom — anything a participant shares on screen arrives as video. So even when a slide shows a URL or a QR code, there is nothing to click.

You have probably seen how this ends. "Please fill in the survey here" appears as a QR code, and every remote participant reaches for their phone to photograph their own monitor, then sends the URL from the phone back to the PC they were sitting at the whole time.

screink removes that detour. Point at where the URL or QR code is, and screink reads it and opens it in a new tab.

> The current version reads QR codes only.

screink does not depend on the internals of any particular meeting service. The only things it works from are the pixels visible on screen and the position you pointed at. That is what lets one implementation work in Microsoft Teams, in Google Meet, in Zoom, and on any other web page.

## Installation

### Chrome Web Store

https://chromewebstore.google.com/detail/screink/jlcokpeegaghadhdfjaoeaoibfgbembn

> The Chrome Web Store version may lag behind the repository during the review process.

### Developer Mode (Manual Install)

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked** and select the repository folder

## How to use

1. Open the page where the screen is being shared
2. Click the screink toolbar icon to enter aim mode (you can assign a keyboard shortcut for this from the options page)
3. Point at the QR code
   - Click it, or
   - Move the crosshair with the arrow keys and press `Enter`
4. Check the URL screink found, and open it
5. Press `Esc` at any time to leave aim mode

Ordinary clicks are never taken away. screink receives the click only while aim mode is on, so it cannot interfere with the meeting UI underneath.

## Privacy

- **Everything happens inside your browser.** No image and no URL is sent anywhere.
- **It is built so that sending would not be possible.** The extension declares no external hosts at all, and every library it needs is bundled in this repository.
- **Nothing is stored.** Captured images, what was read, and where you pointed are all discarded. The only thing saved is your settings.
- **Your screen is not watched.** A single frame is captured at the moment you confirm a position — never continuously.

## Bundled third-party code

QR codes are decoded by [jsQR](https://github.com/cozmo/jsQR) (Apache License 2.0). Chrome's built-in BarcodeDetector is not available on Windows. To avoid reading behaving differently between environments, jsQR is used everywhere.

## Changelog

### [1.0.0] - 2026-08-31

#### Added

- The release version. screink reads QR codes.

#### Fixed

- The outline marking what was read stayed with the screen when the page scrolled, drifting away from the QR code it marks. It rides with the page now, and disappears once it has scrolled off screen.

For the full history, see [CHANGELOG.md](CHANGELOG.md).

---

# スクリーンク

## 概要

TeamsやGoogle Meet、Zoomなどをブラウザで使っているとき、参加者が画面共有した資料は「映像」として表示されます。そのため、スライドの中にURLやQRコードが写っていても、クリックできるものは何もありません。

その先に何が起こるかは、たぶん見覚えがあると思います。「アンケートはこちらからお願いします」がQRコードだけで提示され、オンライン参加者は一斉にスマホを取り出して自分のモニタを撮影し、読み取ったURLを、さっきからずっと座っていたPCへ向けて送信する——という間抜けなことになります。

スクリーンクは、この回り道をなくします。URLやQRコードが写っている場所を指すだけで、スクリーンクがそれを読み取り、新しいタブで開きます。

> 現バージョンではQRコードにのみ対応しています。

スクリーンクは、特定の会議サービスの内部構造に依存しません。手がかりにするのは「画面に見えているピクセル」と「あなたが指した位置」だけです。そのおかげで、ひとつの実装でMicrosoft TeamsでもGoogle MeetでもZoomでも、その他のどんなWebページでも動くのです。

## インストール

### Chrome ウェブストア

https://chromewebstore.google.com/detail/screink/jlcokpeegaghadhdfjaoeaoibfgbembn

> Chrome ウェブストア版は、審査中のため最新リリースより古い場合があります。

### デベロッパーモード（手動インストール）

1. このリポジトリをダウンロードまたはクローン
2. Chromeで `chrome://extensions` を開く
3. 右上の **デベロッパーモード** を有効にする
4. **パッケージ化されていない拡張機能を読み込む** をクリックし、リポジトリのフォルダを選択

## 使い方

1. 画面共有が表示されているページを開く
2. スクリーンクのツールバーアイコンをクリックして照準モードに入る（ショートカットキーはオプション設定から割り当てられます）
3. QRコードが写っている場所を指す
   - クリックする、または
   - 矢印キーで照準を動かして `Enter` を押す
4. スクリーンクが見つけたURLを確認して開く
5. `Esc` を押せばいつでも照準モードを解除できます

通常のクリックを奪うことはありません。スクリーンクがクリックを受け取るのは照準モード中だけなので、その下にある会議UIの操作を妨げません。

## プライバシー

- **すべての処理がブラウザ内で完結します。** 画像もURLも、どこにも送信されません。
- **そもそも送信できない構造にしています。** 拡張は外部ホストを一切宣言しておらず、必要なライブラリはすべてこのリポジトリに同梱されています。
- **何も保存しません。** 切り出した画像・認識結果・指した位置は、いずれも破棄されます。保存されるのは設定だけです。
- **画面を監視しません。** 画面を取得するのは、あなたが位置を確定した瞬間の1枚だけです。常時取得は行いません。

## 同梱しているサードパーティのコード

QRコードのデコードには[jsQR](https://github.com/cozmo/jsQR)（Apache License 2.0）を使用しています。Chrome標準の BarcodeDetector は Windows で利用できず、環境によって読み取りの挙動が変わるのを避けるため、すべての環境でjsQRを使います。

## 更新履歴

### [1.0.0] - 2026-08-31

#### 追加

- リリースバージョンになりました。読み取れるのはQRコードです。

#### 修正

- 読み取った位置を示す枠が、ページをスクロールしても画面に貼り付いたまま残り、示していたQRコードから離れていってしまいました。ページの内容と一緒に動くようにし、画面の外へ出たら消えるようにしました。

全履歴は [CHANGELOG.md](CHANGELOG.md) を参照してください。
