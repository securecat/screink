# Accessibility

Last updated: 2026-11-24

## Priorities and Goals

This statement covers:

- The extension's own UI (the popup, the options page, and the "What was read" page)
- Aim mode (the crosshair and the result panel that screink draws on top of a page), and how it affects operating that page

For the UI, we target WCAG 2.2 Level AA, and we treat it as a minimum, not a ceiling. Some of our own rules are stricter than AA (see [Contributor Expectations](#contributor-expectations)).

## Supported Environments

- Browser: Google Chrome (desktop)
- Operating systems: tested on Windows and macOS
- Screen readers: tested with NVDA and PC-Talker on Windows, and VoiceOver on macOS

## Known Limitations

- To aim, you need to know where the QR code or URL is on the screen, so this step depends on visual information. The result panel that appears afterwards is text, and screen readers read it.
- After you confirm a position, the aim mode display disappears until the result panel appears, and nothing is shown or announced in the meantime. This usually takes well under a second, but reading a URL written as text took up to about 2 seconds in our measurements. When the result panel appears, focus moves to a button on the panel. If you have set URLs to open directly in a new tab, the tab opens instead of the panel.
- Each press of an arrow key moves the crosshair 8px (1px with Shift). The crosshair starts in the middle of the screen, so moving it to an edge takes many presses. Holding the key down keeps the crosshair moving.

## Effects of Aim Mode on the Page

- Aim mode starts only when you start it from the popup, or with a keyboard shortcut you assigned yourself. No shortcut is assigned by default, so screink does not take any keys away from screen readers or from the page until you start aim mode.
- While you are aiming, clicks and mouse movement do not reach the page. The arrow keys, `Enter`, `Space`, and `Esc` go to screink wherever the focus is. Other keys reach the page.
- While the result panel is shown, clicks reach the page as usual. `Esc` closes the panel and does not reach the page.
- Focus moves to aim mode when it starts, then to a button on the result panel when the panel appears. When aim mode ends, focus returns to where it was before aim mode started.
- So that it can be read on top of any page, aim mode is always drawn with light text on a dark background, regardless of the light or dark theme. The crosshair and frames are drawn in two colors, one light and one dark.

## Reporting Accessibility Barriers

Please report barriers through [GitHub Issues](https://github.com/securecat/screink/issues). You can write in English or Japanese.

The following details help us, but all of them are optional:

- What you were trying to do
- The screen or feature you were using
- What happened, and what you expected
- Your OS, browser version, and screink version
- Any assistive technology you use, such as a screen reader

You don't need to tell us about any disability. Screenshots and recordings are not required.

## Response Process

screink is developed by an individual, so we can't promise a deadline for replies or fixes. We will respond as quickly as we can.

- We will reply on the issue once we've seen your report
- If there is a workaround, we will share it
- Before releasing a fix, we may ask you to confirm that it works for you
- Fixes are recorded in [CHANGELOG.md](https://github.com/securecat/screink/blob/main/CHANGELOG.md)

## Contributor Expectations

These expectations apply equally to human contributors and coding agents.

When you change the UI:

- Use native form controls (`<input>`, `<select>`, `<textarea>`). Don't use `<div>` or `<span>` as buttons; use `<button>` for actions on the page and `<a>` for navigation
- Don't use the `disabled` attribute
- Don't remove focus indicators (no `outline: none`)
- Don't remove link underlines
- Keep text contrast at 7:1 or higher for body text and 4.5:1 or higher for secondary text, in both light and dark themes
- Keep non-text elements, such as borders and icons, at 3:1 or higher against adjacent colors
- Don't apply `opacity` to elements that need contrast
- Use a minimum font size of 16px for Japanese and 14px for English
- Use `font-family: sans-serif` (don't use `system-ui`)
- Don't dismiss status messages automatically
- Don't add anything that moves on its own, such as auto-scrolling

After the change, check that everything can be operated with a keyboard alone, and that a screen reader such as NVDA reads the content correctly.

The UI is shown in English and Japanese with the same styles, so keep text at 16px or larger in English too.

Aim mode is drawn on top of pages we don't control. Keep its contrast independent of the page: put text on an opaque dark surface, and draw lines and frames in both a light and a dark color. Its styles are reset with `all: initial`, which also resets the text color to black, so always set a color explicitly. When the result panel appears, move focus into it, and when aim mode ends, return focus to where it was.

## Ownership and Maintenance

This statement is maintained by the maintainer, securecat. We update it when we add features or when the tested environments change.

## Feedback on This Statement

Suggestions about this statement or our approach to accessibility are also welcome through [GitHub Issues](https://github.com/securecat/screink/issues).

---

# アクセシビリティ

最終更新：2026-11-24

## 優先事項と目標

この文書が対象とするのは、次のとおりです。

- 拡張機能そのもののUI（ポップアップ、オプション設定ページ、「読み取った内容」のページ）
- 照準モード（スクリーンクがページの上に重ねて表示する照準と結果パネル）と、それがページの操作に与える影響

UIは WCAG 2.2 のレベル AA を目標とし、これを上限ではなく下限と考えています。AAより厳しい独自の基準もあります（[貢献者への期待](#貢献者への期待)を参照）。

## 対応している環境

- ブラウザ：Google Chrome（デスクトップ版）
- OS：Windows、macOS で動作を確認済み
- スクリーンリーダー：Windows の NVDA と PC-Talker、macOS の VoiceOver で読み上げを確認済み

## 既知の制限

- 照準を合わせるには、QRコードやURLが画面上のどこにあるかを把握している必要があり、この操作は視覚的な情報に頼っています。そのあとに表示される結果パネルはテキストで、スクリーンリーダーで読み上げられます。
- 位置を確定してから結果パネルが表示されるまでのあいだ、照準モードの表示が消え、何も表示されず、読み上げもされません。多くの場合は1秒にも満たない時間ですが、文字で書かれたURLを読み取るときは、実測で最大2秒ほどかかりました。結果パネルが表示されると、フォーカスがパネル内のボタンへ移ります。直接タブを開く設定にしている場合は、パネルの代わりに新しいタブが開きます。
- 矢印キーを1回押すと、照準は 8px（Shift を押しながらだと 1px）動きます。照準は画面の中央から始まるため、画面の端まで動かすには何度も押す必要があります。キーを押し続けると、照準は続けて動きます。

## 照準モードがページの操作に与える影響

- 照準モードが動くのは、ポップアップから開始したときと、自分で割り当てたショートカットキーで開始したときだけです。ショートカットキーは初期状態では割り当てられていないため、照準モードを開始するまで、スクリーンリーダーやページのキー操作を奪うことはありません。
- 照準を合わせているあいだは、クリックやマウスの動きはページに届きません。矢印キー・`Enter`・スペース・`Esc` は、フォーカスがどこにあってもスクリーンクが受け取ります。それ以外のキーはページに届きます。
- 結果パネルを表示しているあいだは、クリックは元どおりページに届きます。`Esc` はパネルを閉じるために使い、ページには届きません。
- 照準モードを開始するとフォーカスは照準モードへ、結果パネルが表示されるとパネル内のボタンへ移ります。照準モードを終えると、開始する前にフォーカスがあった場所へ戻ります。
- どんなページの上に重なっても読めるよう、照準モードの表示は、ライトテーマ・ダークテーマに関わらず、暗い背景に明るい文字で表示します。照準線や枠は、明るい色と暗い色の2色で描いています。

## アクセシビリティの問題を報告する

問題は [GitHub Issues](https://github.com/securecat/screink/issues) で報告してください。日本語でも英語でも構いません。

次のことを書いてもらえると助かりますが、どれも任意です。

- 何をしようとしていたか
- 使っていた画面や機能
- 何が起きたか、どうなると思っていたか
- OS、ブラウザのバージョン、スクリーンクのバージョン
- 使っている支援技術（スクリーンリーダーなど）

障害の有無や内容を書く必要はありません。スクリーンショットや録画も必須ではありません。

## 対応の流れ

スクリーンクは個人で開発しているため、返信や修正の期限はお約束できません。それでも、できるかぎり早く対応します。

- 報告を確認したら、Issue で返信します
- 回避策があれば、お知らせします
- 修正をリリースする前に、問題が解消したかどうかの確認をお願いすることがあります
- 修正の内容は [CHANGELOG.md](https://github.com/securecat/screink/blob/main/CHANGELOG.md) に記載します

## 貢献者への期待

ここに挙げることは、人間の貢献者にもコーディングエージェントにも、同じように求めます。

UIを変更するときは、次を守ってください。

- フォームにはネイティブの要素（`<input>`・`<select>`・`<textarea>`）を使う。`<div>` や `<span>` をボタンの代わりにしない。画面内の操作には `<button>`、ページの移動には `<a>` を使う
- `disabled` 属性を使わない
- フォーカスインジケーターを消さない（`outline: none` を使わない）
- リンクの下線を消さない
- テキストのコントラスト比は、本文で 7:1 以上、補足的なテキストで 4.5:1 以上にする。ライトテーマとダークテーマのそれぞれで満たす
- 境界線やアイコンなど、テキスト以外の要素も、隣り合う色に対して 3:1 以上にする
- コントラストが必要な要素に `opacity` を使わない
- 文字サイズは、日本語で 16px 以上、英語で 14px 以上にする
- `font-family` は `sans-serif` にする（`system-ui` は使わない）
- ステータスメッセージを自動で消さない
- 自動スクロールなど、ひとりでに動くものを作らない

変更したあとは、キーボードだけですべて操作できること、NVDA などのスクリーンリーダーで内容が正しく読み上げられることを確認してください。

UIは英語と日本語を同じスタイルで表示するため、英語でも文字サイズは 16px 以上にしてください。

照準モードは、こちらでは手を加えられないページの上に描かれます。コントラストをページの内容に頼らないでください。文字は不透明な暗い面の上に置き、線や枠は明るい色と暗い色の両方で描きます。スタイルは `all: initial` でリセットしており、文字色も黒に戻るため、色は必ず明示してください。結果パネルを表示するときはパネルの中へフォーカスを移し、照準モードを終えるときは元の場所へフォーカスを戻してください。

## 責任者と保守

この文書は、メンテナーの securecat が管理しています。機能を追加したときや、動作を確認した環境が変わったときに更新します。

## この文書へのフィードバック

この文書やアクセシビリティへの取り組み方についての提案も、[GitHub Issues](https://github.com/securecat/screink/issues) で受け付けています。
