# Privacy Policy

**screink collects nothing, stores nothing, and sends nothing anywhere.**

That is the whole policy. The rest of this page explains how the extension is built so that
you do not have to take that on trust.

Last updated: 2026-08-31

## What screink does with your screen

When you enter aim mode and confirm a position, screink captures **one still image of the
visible area of the current tab**, crops the part around the position you pointed at, and looks
for a QR code in it.

- The image exists only in the extension's memory while it is being read.
- It is never written to a file, to browser storage, or anywhere else.
- It is discarded when the extension goes idle, which Chrome does automatically after a short
  time, and when Chrome restarts.
- Nothing is captured at any other moment. screink does not watch your screen.

## What is stored

Only the settings on the extension's own options page, kept in `chrome.storage.local`, which
never leaves the device. At the time of writing that is a single on/off preference.

Not stored: captured images, what was read from them, the URLs found, where you pointed, or
anything about the pages you visit.

## What is sent

Nothing. screink has no server, no analytics, no crash reporting, and no accounts.

This is not simply a promise about how the code behaves today. The extension is built so that
sending would not be possible:

- It declares **no host permissions**, so it has no standing access to any website.
- Its pages declare `connect-src 'none'` in their Content Security Policy, which means the
  browser itself refuses any outgoing network request the extension might attempt.
- The one third-party library it uses ([jsQR](https://github.com/cozmo/jsQR), for decoding QR
  codes) is bundled inside the extension rather than loaded from a CDN. Manifest V3 forbids
  remote code, so nothing is fetched at runtime.

Opening a URL you have confirmed does, of course, take you to that website — that is the whole
point of the extension. That happens in a normal browser tab, and screink is not involved from
that moment on. No URL is ever opened without you confirming it first, and only `http` and
`https` addresses are ever opened at all.

## Permissions and why each one is needed

| Permission | Why |
| --- | --- |
| `activeTab` | To capture one frame of the visible area of the current tab, at the moment you confirm a position. It grants access only to the tab you are on, only after you invoke the extension, and it lapses when you navigate away. |
| `scripting` | To load the aim mode overlay into the current tab while you are using it. screink declares no always-on content scripts, so it does not run on tabs you are not using it on. |
| `storage` | To save the settings described above. |

## Children

screink is not directed at children and collects no personal information from anyone.

## Changes

If this policy ever changes, the change will appear in this file and in the repository's
history, which is public.

## Contact

Please open an issue at <https://github.com/securecat/screink/issues>.

---

# プライバシーポリシー

**screink は、何も収集せず、何も保存せず、どこにも送信しません。**

ポリシーとしては以上です。以下は、それを信用していただかなくても済むように、どういう作りに
なっているかを説明したものです。

最終更新：2026-08-31

## 画面に対して screink が行うこと

照準モードに入って位置を確定すると、screink は**現在のタブの表示されている範囲を1枚だけ**
取得し、指した位置の周辺を切り出して、その中からQRコードを探します。

- 画像は、読み取っている間だけ拡張のメモリ上に存在します。
- ファイルにも、ブラウザのストレージにも、どこにも書き込みません。
- 拡張が待機状態になったとき（Chrome がしばらくすると自動的にそうします）と、Chrome の再起動で
  失われます。
- それ以外の瞬間には何も取得しません。screink が画面を見張ることはありません。

## 保存されるもの

拡張の設定画面にある設定だけです。`chrome.storage.local` に保存され、端末の外へは出ません。
現時点では、オン・オフの設定がひとつあるだけです。

保存されないもの：取得した画像、そこから読み取った内容、見つかったURL、指した位置、閲覧している
ページに関する情報。

## 送信されるもの

ありません。screink はサーバーを持たず、アクセス解析も、クラッシュレポートも、アカウントの仕組みも
ありません。

これは「今のコードがそう振る舞う」という約束ではなく、**送信できない作りになっている**という話です。

- **ホスト権限を一切要求しません。** そのため、どのWebサイトに対しても常時アクセス権を持ちません。
- 拡張のページには Content Security Policy で `connect-src 'none'` を指定しています。仮に拡張が
  外部通信を試みても、ブラウザ自身がそれを拒否します。
- 唯一使用しているサードパーティのライブラリ（QRコードのデコードに使う
  [jsQR](https://github.com/cozmo/jsQR)）は、CDNから読み込むのではなく拡張の中に同梱しています。
  Manifest V3 はリモートコードの実行を禁じているため、実行時に何かを取りに行くことはありません。

確認したURLを開けば、当然そのWebサイトへ移動します。それがこの拡張の目的そのものです。移動は通常の
ブラウザのタブで行われ、その先に screink は関与しません。確認なしにURLが開かれることはなく、
そもそも開くのは `http` と `https` のアドレスだけです。

## 権限と、それぞれが必要な理由

| 権限 | 理由 |
| --- | --- |
| `activeTab` | 位置を確定した瞬間に、現在のタブの表示されている範囲を1枚取得するため。いま開いているタブに対して、拡張を起動したあとにだけ有効で、ページを移動すると失われます。 |
| `scripting` | 使用しているあいだだけ、照準モードのUIを現在のタブに読み込むため。常時動作する content script を宣言していないので、使っていないタブでは動作しません。 |
| `storage` | 上記の設定を保存するため。 |

## 子どもについて

screink は子どもを対象としたものではなく、誰からも個人情報を収集しません。

## 変更について

このポリシーを変更する場合は、このファイルと、公開されているリポジトリの履歴に残ります。

## お問い合わせ

<https://github.com/securecat/screink/issues> に issue を立ててください。
