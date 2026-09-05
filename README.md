# screink

## Overview

When you join a meeting through your browser — Microsoft Teams, Google Meet, Zoom — anything a participant shares on screen arrives as video. So even when a slide shows a URL or a QR code, there is nothing to click.

You have probably seen how this ends. "Please fill in the survey here" appears as a QR code, and every remote participant reaches for their phone to photograph their own monitor, then sends the URL from the phone back to the PC they were sitting at the whole time.

screink removes that detour. Point at where the URL or QR code is, and screink reads it and opens it in a new tab.

> A URL written as text is read by OCR, so it is not always read correctly. A URL that runs across more than one line is not supported.

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
3. Point at the QR code, or at the URL itself
   - Click it, or
   - Move the crosshair with the arrow keys and press `Enter`
4. Check the URL screink found, and open it
   - With **Open URLs from QR codes directly in a new tab** ticked in the popup, a URL from a QR code opens without asking
   - **Open URLs read from text directly in a new tab**, on the options page, does the same for URLs read from text.
   - If what was read is text rather than a URL, the panel appears whatever those are set to
5. Press `Esc` at any time to leave aim mode

Ordinary clicks are never taken away. screink receives the click only while aim mode is on, so it cannot interfere with the meeting UI underneath.

## Privacy

- **Everything happens inside your browser.** No image and no URL is sent anywhere.
- **It is built so that sending would not be possible.** The extension declares no external hosts at all, and every library it needs is bundled in this repository.
- **Nothing is stored.** Captured images, what was read, and where you pointed are all discarded. The only thing saved is your settings.
- **Your screen is not watched.** A single frame is captured at the moment you confirm a position — never continuously.

## Bundled third-party code

QR codes are decoded by [jsQR](https://github.com/cozmo/jsQR) (Apache License 2.0). Chrome's built-in BarcodeDetector is not available on Windows. To avoid reading behaving differently between environments, jsQR is used everywhere.

Text is read by [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache License 2.0) and the Tesseract OCR engine compiled to WebAssembly, with the English model bundled alongside. Everything it runs is carried inside the extension; nothing is fetched at runtime. See [src/vendor/tesseract/README.md](src/vendor/tesseract/README.md) for versions and licenses.

## Changelog

### [1.2.1] - 2026-09-06

#### Fixed

- Reading no longer fails when two readings come close together. Chrome allows only so many captures a second, and going over ended the reading with a message about checking the tab is visible — which had nothing to do with the cause. It waits a moment and takes the picture again.

For the full history, see [CHANGELOG.md](CHANGELOG.md).

---

# スクリーンク

## 概要

TeamsやGoogle Meet、Zoomなどをブラウザで使っているとき、参加者が画面共有した資料は「映像」として表示されます。そのため、スライドの中にURLやQRコードが写っていても、クリックできるものは何もありません。

その先に何が起こるかは、たぶん見覚えがあると思います。「アンケートはこちらからお願いします」がQRコードだけで提示され、オンライン参加者は一斉にスマホを取り出して自分のモニタを撮影し、読み取ったURLを、さっきからずっと座っていたPCへ向けて送信する——という間抜けなことになります。

スクリーンクは、この回り道をなくします。URLやQRコードが写っている場所を指すだけで、スクリーンクがそれを読み取り、新しいタブで開きます。

> URL文字列はOCRで読み取るため、必ずしも正しく読み取れるとは限りません。また、複数行に渡るURLにも対応していません。

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
3. QRコードやURLが写っている場所を指す
   - クリックする、または
   - 矢印キーで照準を動かして `Enter` を押す
4. スクリーンクが見つけたURLを確認して開く
   - ポップアップの **QRのURLは直接タブを開く** をONにしている時は、QRコードから読み取ったURLを、確認を挟まず新しいタブで開きます
   - オプション設定の **URL文字列を直接タブを開く** は、文字から読み取ったURLに対して同じことをします。
   - 読み取った内容がURLでない場合は、どちらの設定でも確認パネルを表示します
5. `Esc` を押せばいつでも照準モードを解除できます

通常のクリックを奪うことはありません。スクリーンクがクリックを受け取るのは照準モード中だけなので、その下にある会議UIの操作を妨げません。

## プライバシー

- **すべての処理がブラウザ内で完結します。** 画像もURLも、どこにも送信されません。
- **そもそも送信できない構造にしています。** 拡張は外部ホストを一切宣言しておらず、必要なライブラリはすべてこのリポジトリに同梱されています。
- **何も保存しません。** 切り出した画像・認識結果・指した位置は、いずれも破棄されます。保存されるのは設定だけです。
- **画面を監視しません。** 画面を取得するのは、あなたが位置を確定した瞬間の1枚だけです。常時取得は行いません。

## 同梱しているサードパーティのコード

QRコードのデコードには[jsQR](https://github.com/cozmo/jsQR)（Apache License 2.0）を使用しています。Chrome標準の BarcodeDetector は Windows で利用できず、環境によって読み取りの挙動が変わるのを避けるため、すべての環境でjsQRを使います。

文字の読み取りには[Tesseract.js](https://github.com/naptha/tesseract.js)（Apache License 2.0）と、WebAssembly に移植された Tesseract OCR エンジンを使用しています。英語のモデルも同梱しており、実行時に外部から取得するものはありません。バージョンとライセンスは [src/vendor/tesseract/README.md](src/vendor/tesseract/README.md) にあります。

## 更新履歴

### [1.2.1] - 2026-09-06

#### 修正

- 続けて読み取ったときに失敗しなくなりました。Chrome は画面を取得できる回数を毎秒で制限していて、それを超えると読み取りごと失敗していました。しかも出るのは「タブが表示されているか確認してください」という、原因と関係のない案内でした。少し待って撮り直すようにしました。

全履歴は [CHANGELOG.md](CHANGELOG.md) を参照してください。
