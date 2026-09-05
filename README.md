# screink

## Overview

When you join a meeting through your browser — Microsoft Teams, Google Meet, Zoom — anything a participant shares on screen arrives as video. So even when a slide shows a URL or a QR code, there is nothing to click.

You have probably seen how this ends. "Please fill in the survey here" appears as a QR code, and every remote participant reaches for their phone to photograph their own monitor, then sends the URL from the phone back to the PC they were sitting at the whole time.

screink removes that detour. Point at where the URL or QR code is, and screink reads it and opens it in a new tab.

> A URL written as text is read by OCR, so it is not always read correctly. Check what was read before opening it.

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
   - **Open URLs read from text directly in a new tab**, on the options page, does the same for URLs read from text. The two work independently
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

### [1.2.0] - 2026-09-05

#### Added

- URLs written as text are read as well. Where you point, screink still looks for a QR code first; when there is none, the line under your position is read as text and any URL in it is offered the same way. A URL with no scheme in front of it is treated as https.
- A second direct-link setting, on the options page, for URLs read from text. It works on its own, independently of the popup's setting for QR codes, and says what turning it on means: text is not always read correctly, and a misread URL may not exist at all or may lead somewhere else entirely.

#### Changed

- The popup's checkbox is labelled "Open URLs from QR codes directly in a new tab". It only ever covered QR codes; now that text can be read too, it says which it is.
- The buttons on the panel sit in two rows — what to do with what was read above, what to do with the reading itself below. "Point again" always starts the second row, so it no longer moves depending on how many buttons precede it.
- "Copied" appears beside the button that was pressed rather than above the whole group.
- The options page section is headed "See what was read" and describes the setting it holds, rather than being framed as something for when reading fails.

#### Fixed

- Stepping through candidates no longer resizes the panel. Candidates of different lengths made it grow and shrink, moving the buttons — including the one being pressed to step through them. The tallest candidate now sets the height for all of them.
- "Copied" stayed until the next candidate was shown. It now goes once your attention has plainly moved on: when the inspect tab opens in front, or when the page loses focus.
- Notes were too dark to read comfortably against the dark theme.

For the full history, see [CHANGELOG.md](CHANGELOG.md).

---

# スクリーンク

## 概要

TeamsやGoogle Meet、Zoomなどをブラウザで使っているとき、参加者が画面共有した資料は「映像」として表示されます。そのため、スライドの中にURLやQRコードが写っていても、クリックできるものは何もありません。

その先に何が起こるかは、たぶん見覚えがあると思います。「アンケートはこちらからお願いします」がQRコードだけで提示され、オンライン参加者は一斉にスマホを取り出して自分のモニタを撮影し、読み取ったURLを、さっきからずっと座っていたPCへ向けて送信する——という間抜けなことになります。

スクリーンクは、この回り道をなくします。URLやQRコードが写っている場所を指すだけで、スクリーンクがそれを読み取り、新しいタブで開きます。

> 文字として書かれたURLはOCRで読み取るため、必ずしも正しく読み取れるとは限りません。開く前に読み取った内容をご確認ください。

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
   - オプション設定の **URL文字列を直接タブを開く** は、文字から読み取ったURLに対して同じことをします。2つは独立に効きます
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

### [1.2.0] - 2026-09-05

#### 追加

- 文字として書かれたURLも読み取れるようにしました。指した場所ではまずQRコードを探し、見つからなかったときに、指した位置を横切る行を文字として読み取ります。その中にURLがあれば、QRコードのときと同じ形で提示します。`https://` などが省略されている場合は https として扱います。
- オプション設定に「URL文字列を直接タブを開く」を追加しました。ポップアップのQRコード用の設定とは独立に効きます。OCRの都合上、文字の読み取りは必ずしも正しいとは限らず、読み違えたURLは存在しないURLになったり、まったく別のページを指したりすることがあります。

#### 変更

- ポップアップのチェックボックスのラベルを「QRのURLは直接タブを開く」にしました。もともとQRコードだけが対象でしたが、文字も読み取るようになったためです。
- 確認パネルのボタンを2行に分けました。1行目が読み取ったものへの操作、2行目が読み取りそのものへの操作です。「もう一度指す」は常に2行目の先頭に来るので、前にいくつボタンがあるかで位置が変わることがなくなりました。
- 「コピーしました」を、押したボタンの隣に出すようにしました。
- オプション設定の節の見出しを「読み取った内容を確認する」にし、その設定が何をONにするのかを書きました。「読み取れないとき」のためのもの、という枠組みをやめています。

#### 修正

- 候補を切り替えてもパネルの大きさが変わらないようにしました。長さの違う候補があると伸び縮みし、ボタンが動いていました——切り替えのために押している、そのボタンごとです。いちばん高い候補に合わせて高さを揃えます。
- 「コピーしました」が次の候補を出すまで残り続けていました。注視が別へ移ったことが明白なタイミング——確認画面のタブが前に出たとき、ページから注視が外れたとき——で消えるようにしました。
- ダークテーマで、注釈の文字が背景に対して暗すぎて読みにくくなっていました。

全履歴は [CHANGELOG.md](CHANGELOG.md) を参照してください。
