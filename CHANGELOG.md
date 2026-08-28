# Changelog

All notable changes to screink are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
