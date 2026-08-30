# Changelog

All notable changes to screink are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-08-31

### Added

- English, alongside Japanese. Everything follows the language your browser is set to: the name in the toolbar, the options page, and the panel that shows what was read. In Japanese the extension is called スクリーンク.

### Changed

- New toolbar icons.
- Aim mode shows a crosshair and nothing else. The square frame said "the code has to be inside this box", which stopped being true in 0.2.2, when cropping started following the code you point at instead of the point itself. A code outside the frame read fine; one inside it did not read unless you pointed at it.
- The panel showing what was read moves to whichever half of the screen the code is not in, so it never covers the thing it just read.
- No keyboard shortcut is claimed on install. Nothing is bound and no key combination is held until you assign one yourself, from the options page. An extension cannot release a shortcut once Chrome has given it one — only you can — so it seemed wrong for a tool reached for now and then to hold a key whether or not anyone used it.
- Settings stay on the device instead of syncing through a Google account. It is one on/off preference, not worth qualifying "nothing leaves your browser" over.
- The popup drops its opening paragraph. The options page drops the search-area setting, which now only feeds a fallback, and the restore-defaults button, which restored a single checkbox.

### Fixed

- The words naming aim mode in the bar at the top were black on a near-black background, so the bar read as an empty dark strip.
- The options page moved under the pointer. Turning the setting on printed a line below it that pushed the button beneath it down; moving to that button erased the line and pulled the button back up as it was being clicked, so it could not be pressed.
- The keyboard shortcut shown was the one the extension had asked for, not the one actually in effect. Chrome refuses the request when the combination is already taken, and you can rebind it at any time, so the displayed key could simply be wrong.

## [0.2.2] - 2026-08-30

### Fixed

- Pointing anywhere on a QR code now reads it. Until now it had to be pointed at near its centre, which was easy to miss when codes of different sizes sat side by side. The crop was a square centred on where you pointed: off-centre, it had to grow to reach the far edge of the code, while the size that still excluded the neighbouring code shrank, and sometimes nothing fitted in between. The crop now follows the code itself — the area around your position is scanned for a block of mixed light and dark pixels, which is what a QR code looks like and a margin or a flat panel does not, and the outline of the one under your position is what gets read. Sweeping across three codes of different sizes, readable positions went from 15 of 35 to 32 of 35; the three that remain are points where there is no code.
- The marker showing where you pointed on the debug page was offset by the width of the white border added in 0.2.1.

### Changed

- Reading is faster, 164–223ms down to 90–119ms on the same sample, because it usually decodes once rather than trying a series of sizes.

## [0.2.1] - 2026-08-28

### Fixed

- A QR code sitting close to another one could not be read at all. The search started from an area wide enough to catch the neighbour, and the decoder returns nothing when two codes share an image. It now starts much smaller and grows in finer steps, so there is a step where only the code you pointed at is in frame. Two 80-pixel codes 5 pixels apart went from unreadable to read in 35ms.
- Codes with no white margin around them, including ones running right up against the edge of the screen, are now given one before decoding. The QR standard requires that margin and real slides often lack it, and cropping in close removes whatever margin there was.

### Changed

- Crops wider than 1200 device pixels are scaled down before decoding, which keeps the finer search from costing time. Waiting for a search that finds nothing dropped from about 1.5 seconds to about 1 second on a high-DPI display. The smallest readable code is unchanged at 48 device pixels.

## [0.2.0] - 2026-08-28

QR codes now work end to end: point at one and open the URL it carries.
URLs shown as text still need OCR, which is not built yet.

### Added

- QR code decoding. Point at a QR code and screink reads it, shows what it found, and opens it in a new tab on confirmation.
- Confirmation panel that leads with the destination host, so you can see where a code is about to send you before you go there.
- Copying the decoded content, for codes that carry text rather than a URL.
- Debug page now draws the position you pointed at and the outline of every code it decoded on top of the captured image.
- Setting for the size of the area searched for QR codes.

### Changed

- The search area now widens progressively — a quarter, a half, one and two times the configured size — and stops at the first code it reads. Scanning a wide area first loses codes, because the decoder returns nothing at all when several codes share one image. Starting narrow also matches what you meant: the code you pointed at.
- A decoded code only counts as the one you pointed at if your position falls inside it, or within one code-size of its centre. Widening the search no longer picks up a code on the far side of the screen.
- The crop is a square sized for QR codes, replacing the separate width and height settings. The band shape suited to URL text returns with OCR.

### Security

- Only `http` and `https` are ever opened. A QR code carrying `javascript:`, `data:`, `chrome://` or `file://` is shown as plain text with no open button.
- The URL is validated again in the service worker immediately before the tab is created, rather than trusting what the page-side script passed along.

## [0.1.0] - 2026-08-28

First proof-of-concept release. Aiming and screen capture work; recognising
URLs and QR codes does not exist yet.

### Added

- Aim mode: enter it from the toolbar popup or with `Alt` + `Shift` + `S`, point at a position with the mouse or the arrow keys, and confirm with a click or `Enter`. `Esc` leaves the mode.
- Region capture: the area around the confirmed position is captured and cropped, with the coordinate conversion verified at device scale 1, 1.5 and 2.
- Result panel showing what was captured, kept on screen until dismissed.
- Debug page for inspecting the cropped image, so the aimed position and the captured region can be compared by eye.
- Options page for the size of the captured region and for display preferences.
- The aim mode overlay is injected only when it is used, so the extension declares no host permissions and does not run on idle tabs. Extension pages declare `connect-src 'none'`, so no image or URL can leave the browser.

---

# 更新履歴

screink のすべての重要な変更点をこのファイルに記載します。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づき、
バージョン番号は [セマンティック バージョニング](https://semver.org/lang/ja/) に従います。

## [0.3.0] - 2026-08-31

### 追加

- 日本語に加えて英語に対応しました。ツールバーに出る名前も、オプション設定も、読み取った内容を出すパネルも、ブラウザの表示言語に従います。日本語での名前は「スクリーンク」です。

### 変更

- ツールバーのアイコンを新しくしました。
- 照準モードの表示を十字だけにしました。四角い枠は「この中にコードが入っていないといけない」という意味でしたが、0.2.2 で切り出しが「指した点」ではなく「指したコード」に従うようになった時点で、実態と合わなくなっていました。枠の外にあるコードも読めますし、枠の中にあっても指していなければ読みません。
- 読み取った内容を出すパネルが、コードのある側とは反対の半分に出るようになりました。読み取ったものをパネル自身が隠すことがなくなります。
- インストール時にショートカットキーを確保しないようにしました。オプション設定から自分で割り当てるまで、何も割り当てられず、キーの組み合わせも押さえません。Chrome がいったん割り当てたショートカットを拡張の側から外す手段は無く、外せるのはユーザーだけです。ときどき使う道具が、使う使わないに関わらずキーを握り続けるのは筋が通らないと考えました。
- 設定を Google アカウント経由で同期せず、端末内に保存するようにしました。オン・オフの設定ひとつのために「ブラウザの外に出ない」という説明に但し書きを付けるのは割に合わないためです。
- ポップアップの冒頭の説明文を削除しました。オプション設定からは、いまや保険の処理にしか効かない「探す範囲」の設定と、チェックボックス1つを戻すだけだった「既定値に戻す」ボタンを削除しました。

### 修正

- 画面上部のバーに出る照準モードの名前が、ほぼ黒の背景に黒文字で描かれていて、バーが黒い帯にしか見えていませんでした。
- オプション設定で、操作するとページの内容が動いていました。設定をオンにすると下に一行表示され、その下のボタンが押し下げられます。そのボタンへ移ろうとすると表示が消えてボタンが元の位置に戻るため、押そうとした瞬間にずれて押せませんでした。
- ショートカットキーの表示が、実際に有効な割り当てではなく、拡張が希望したキーになっていました。希望したキーは、他と重なっていれば Chrome に断られますし、ユーザーが変更することもあるため、表示が実態と違うことがありました。

## [0.2.2] - 2026-08-30

### 修正

- QRコードの上ならどこを指しても読めるようになりました。これまでは中心の近くを指す必要があり、大きさの異なるコードが並んでいると外しやすい状態でした。切り出しが「指した点を中心とする正方形」だったためです。中心からずれるほど、コード全体を覆うには大きな正方形が必要になり、一方で隣のコードを巻き込まない上限は小さくなるので、その間に収まる大きさが無くなることがありました。切り出しをコード自体に合わせるようにしました。指した位置の周りから、明暗が混在するかたまり（QRコードはそう見えます。余白や単色の面はそう見えません）を探し、指した位置にあるものの輪郭を読み取ります。大きさの異なる3つのコードを横切って調べたところ、読める位置が35箇所中15箇所から32箇所になりました。残る3箇所はコードが無い場所です。
- 目視確認画面で、指した位置を示すマーカーが、0.2.1 で足した白い縁の分だけずれていました。

### 変更

- 読み取りが速くなりました。同じサンプルで 164〜223ms から 90〜119ms へ。多くの場合、複数の大きさを順に試さずに一度で読み取れるためです。

## [0.2.1] - 2026-08-28

### 修正

- 別のQRコードが近くにあると、まったく読めないことがありました。探す範囲が、最初から隣のコードを巻き込むほど広かったためです。デコーダは1枚の画像に2つ写っていると1つも返しません。もっと狭いところから、細かい刻みで広げるようにしたので、指したコードだけが写る段階が必ず現れます。一辺80px・間隔5px の2つは、読めない状態から 35ms で読めるようになりました。
- 周囲に白い余白が無いQRコード（画面の端にぴったり接しているものを含む）に、読み取る前に余白を足すようにしました。規格はこの余白を要求していますが実際のスライドには無いことが多く、狭く切り出すと残っていた余白も削られてしまうためです。

### 変更

- 一辺が1200デバイスピクセルを超える切り出しは、読み取る前に縮小するようにしました。探索を細かくした分の時間を相殺します。見つからなかったときの待ち時間が、高DPIの画面で約1.5秒から約1秒になりました。読み取れる最小サイズは48デバイスピクセルのまま変わりません。

## [0.2.0] - 2026-08-28

QRコードが端から端まで動くようになりました。指せば、そのURLが開けます。文字として表示されたURLはOCRが必要で、そちらはまだありません。

### 追加

- QRコードのデコード。QRコードを指すと screink がそれを読み取り、内容を提示し、確認のうえ新しいタブで開きます。
- 開く先のホスト名を先頭に大きく出す確認パネル。そのコードがどこへ連れて行こうとしているのかを、行く前に確認できます。
- 読み取った内容のコピー。URLではなくテキストを持つコードのためのものです。
- デバッグ画面が、切り出した画像の上に、指した位置と読み取ったすべてのコードの枠を重ねて表示するようになりました。
- QRコードを探す範囲の大きさを変える設定。

### 変更

- 探す範囲を、設定値の 1/4・1/2・等倍・2倍と段階的に広げ、最初に読めたところで止めるようにしました。広い範囲から探すとかえって読めません。デコーダは1枚の画像に複数のコードが写っていると1つも返さないためです。狭い範囲から始めることは「指したコードを読む」という意図にも一致します。
- 読み取ったコードを「指したもの」と見なす条件を、指した位置がその中にあるか、中心から1コード分以内にあること、としました。範囲を広げても、画面の反対側にあるコードを拾わなくなります。
- 切り出しを、QRコードに合わせた正方形にしました（幅と高さの個別設定を置き換え）。URLの文字列に適した横長の帯は、OCRとともに戻ってきます。

### セキュリティ

- 開くのは `http` と `https` だけです。`javascript:` `data:` `chrome://` `file://` を持つQRコードは、テキストとして提示するだけで開くボタンを出しません。
- タブを作る直前に、service worker 側でURLをもう一度検証します。ページ側のスクリプトから渡された内容を信用しません。

## [0.1.0] - 2026-08-28

最初のPoC（技術検証）版。照準と画面の切り出しまでが動作します。URLやQRコードの認識はまだありません。

### 追加

- 照準モード：ツールバーのポップアップ、または <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> で開始し、マウスまたは矢印キーで位置を指し、クリックか <kbd>Enter</kbd> で確定します。<kbd>Esc</kbd> で解除します。
- 領域の切り出し：確定した位置の周辺を取得して切り出します。座標変換はデバイス倍率 1・1.5・2 で検証済みです。
- 切り出した内容を示す結果パネル。ユーザーが閉じるまで表示を維持します。
- 切り出した画像を確認するためのデバッグ画面。指した位置と実際に切り出された範囲を目視で比較できます。
- 切り出す範囲の大きさと表示に関する設定画面。
- 照準モードのオーバーレイは使用する瞬間だけ注入されます。そのため拡張はホスト権限を一切要求せず、待機中のタブでは動作しません。拡張ページには `connect-src 'none'` を指定しており、画像もURLもブラウザの外へ出られません。
