# Changelog

All notable changes to screink are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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

## [0.1.0] - 2026-08-28

最初のPoC（技術検証）版。照準と画面の切り出しまでが動作します。URLやQRコードの認識はまだありません。

### 追加

- 照準モード：ツールバーのポップアップ、または <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> で開始し、マウスまたは矢印キーで位置を指し、クリックか <kbd>Enter</kbd> で確定します。<kbd>Esc</kbd> で解除します。
- 領域の切り出し：確定した位置の周辺を取得して切り出します。座標変換はデバイス倍率 1・1.5・2 で検証済みです。
- 切り出した内容を示す結果パネル。ユーザーが閉じるまで表示を維持します。
- 切り出した画像を確認するためのデバッグ画面。指した位置と実際に切り出された範囲を目視で比較できます。
- 切り出す範囲の大きさと表示に関する設定画面。
- 照準モードのオーバーレイは使用する瞬間だけ注入されます。そのため拡張はホスト権限を一切要求せず、待機中のタブでは動作しません。拡張ページには `connect-src 'none'` を指定しており、画像もURLもブラウザの外へ出られません。
