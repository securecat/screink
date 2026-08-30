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

### [0.3.0] - 2026-08-31

#### Added

- English, alongside Japanese. Everything follows the language your browser is set to: the name in the toolbar, the options page, and the panel that shows what was read. In Japanese the extension is called スクリーンク.

#### Changed

- New toolbar icons.
- Aim mode shows a crosshair and nothing else. The square frame said "the code has to be inside this box", which stopped being true in 0.2.2, when cropping started following the code you point at instead of the point itself. A code outside the frame read fine; one inside it did not read unless you pointed at it.
- The panel showing what was read moves to whichever half of the screen the code is not in, so it never covers the thing it just read.
- No keyboard shortcut is claimed on install. Nothing is bound and no key combination is held until you assign one yourself, from the options page. An extension cannot release a shortcut once Chrome has given it one — only you can — so it seemed wrong for a tool reached for now and then to hold a key whether or not anyone used it.
- Settings stay on the device instead of syncing through a Google account. It is one on/off preference, not worth qualifying "nothing leaves your browser" over.
- The popup drops its opening paragraph. The options page drops the search-area setting, which now only feeds a fallback, and the restore-defaults button, which restored a single checkbox.

#### Fixed

- The words naming aim mode in the bar at the top were black on a near-black background, so the bar read as an empty dark strip.
- The options page moved under the pointer. Turning the setting on printed a line below it that pushed the button beneath it down; moving to that button erased the line and pulled the button back up as it was being clicked, so it could not be pressed.
- The keyboard shortcut shown was the one the extension had asked for, not the one actually in effect. Chrome refuses the request when the combination is already taken, and you can rebind it at any time, so the displayed key could simply be wrong.

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

### [0.3.0] - 2026-08-31

#### 追加

- 日本語に加えて英語に対応しました。ツールバーに出る名前も、オプション設定も、読み取った内容を出すパネルも、ブラウザの表示言語に従います。日本語での名前は「スクリーンク」です。

#### 変更

- ツールバーのアイコンを新しくしました。
- 照準モードの表示を十字だけにしました。四角い枠は「この中にコードが入っていないといけない」という意味でしたが、0.2.2 で切り出しが「指した点」ではなく「指したコード」に従うようになった時点で、実態と合わなくなっていました。枠の外にあるコードも読めますし、枠の中にあっても指していなければ読みません。
- 読み取った内容を出すパネルが、コードのある側とは反対の半分に出るようになりました。読み取ったものをパネル自身が隠すことがなくなります。
- インストール時にショートカットキーを確保しないようにしました。オプション設定から自分で割り当てるまで、何も割り当てられず、キーの組み合わせも押さえません。Chrome がいったん割り当てたショートカットを拡張の側から外す手段は無く、外せるのはユーザーだけです。ときどき使う道具が、使う使わないに関わらずキーを握り続けるのは筋が通らないと考えました。
- 設定を Google アカウント経由で同期せず、端末内に保存するようにしました。オン・オフの設定ひとつのために「ブラウザの外に出ない」という説明に但し書きを付けるのは割に合わないためです。
- ポップアップの冒頭の説明文を削除しました。オプション設定からは、いまや保険の処理にしか効かない「探す範囲」の設定と、チェックボックス1つを戻すだけだった「既定値に戻す」ボタンを削除しました。

#### 修正

- 画面上部のバーに出る照準モードの名前が、ほぼ黒の背景に黒文字で描かれていて、バーが黒い帯にしか見えていませんでした。
- オプション設定で、操作するとページの内容が動いていました。設定をオンにすると下に一行表示され、その下のボタンが押し下げられます。そのボタンへ移ろうとすると表示が消えてボタンが元の位置に戻るため、押そうとした瞬間にずれて押せませんでした。
- ショートカットキーの表示が、実際に有効な割り当てではなく、拡張が希望したキーになっていました。希望したキーは、他と重なっていれば Chrome に断られますし、ユーザーが変更することもあるため、表示が実態と違うことがありました。

全履歴は [CHANGELOG.md](CHANGELOG.md) を参照してください。
