# screink

## Overview

When you join a meeting through your browser — Microsoft Teams, Google Meet, Zoom — anything a participant shares on screen arrives as video. So even when a slide shows a URL or a QR code, there is nothing to click.

You have probably seen how this ends. "Please fill in the survey here" appears as a QR code, and every remote participant reaches for their phone to photograph their own monitor, then sends the URL from the phone back to the PC they were sitting at the whole time.

screink removes that detour. Point at where the URL or QR code is, and screink reads it and opens it in a new tab.

> The current version reads QR codes only.

screink does not depend on the internals of any particular meeting service. The only things it works from are the pixels visible on screen and the position you pointed at. That is what lets one implementation work in Microsoft Teams, in Google Meet, in Zoom, and on any other web page.

## Installation

### Chrome Web Store

(Coming soon)

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

### [0.4.0] - 2026-08-31

#### Added

- A language setting on the options page. Pick English or Japanese and screink stays in it, whatever language the browser is set to; until you pick, it follows the browser as before. The extension's name, its description and the shortcut description are the exception — Chrome resolves those from the browser's language and an extension cannot override them.

#### Changed

- The toolbar icon and the keyboard shortcut now only start aim mode. Leaving is `Esc` and nothing else. Both used to toggle, so pressing "Enter aim mode" while the panel from the last read was open just closed the panel — a button that did not do what it said. Starting now folds away whatever is on screen and begins a fresh aim.
- Messages saying a setting was saved clear as soon as you touch another control. They used to sit until the page lost focus, so a message could linger beside a setting you had stopped thinking about.

#### Fixed

- The message after a language change read "Saved." either way, leaving its colour to say which language had been chosen. It now names the language.
- The Japanese radio label sat right up against the message beside it.

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

準備中

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

### [0.4.0] - 2026-08-31

#### 追加

- オプション設定に表示言語の設定を追加しました。英語か日本語かを選ぶと、ブラウザの表示言語に関わらずその言語で表示します。選ぶまでは、これまでどおりブラウザの表示言語に従います。拡張の名前・説明・ショートカットキーの説明だけは例外で、これらは Chrome がブラウザの表示言語で解決するため、拡張の側からは切り替えられません。

#### 変更

- ツールバーのアイコンとショートカットキーは、照準モードの開始だけを行うようにしました。解除は `Esc` だけです。どちらもトグルだったため、読み取り結果のパネルが出ている状態で「照準モードを開始」を押しても、パネルが閉じるだけで照準モードに入りませんでした。ボタンに書いてあることと違う動きになっていたわけです。いまは、何が出ていてもいったん畳んで、新しい照準モードが始まります。
- 設定を保存したことを伝える表示が、別のコントロールに触れた時点で消えるようになりました。これまではページから離れるまで残っていたため、もう見ていない設定の横に表示が残り続けることがありました。

#### 修正

- 表示言語を変えたときの表示が、どちらを選んでも「保存しました。」だけで、どちらにしたのかを色だけが伝えている状態でした。選んだ言語を文言に含めるようにしました。
- 日本語のラジオボタンのラベルが、その隣の表示にくっつきすぎていました。

全履歴は [CHANGELOG.md](CHANGELOG.md) を参照してください。
