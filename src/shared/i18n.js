/**
 * 拡張ページの文字列を差し替える。
 *
 * ビルド工程を持たないので、HTML 側に `data-i18n` を書いておき、
 * 読み込み時に `chrome.i18n` の文言で置き換える。
 *
 *   <p data-i18n="popupIntro"></p>          -> textContent を差し替え
 *   <a data-i18n-title="popupOpenOptions">  -> title 属性を差し替え
 *
 * `innerHTML` を使わないのは拡張ページでも同じ方針にしておくため
 * （content script 側は Trusted Types のため必須。仕様書 §4.4）。
 */

export function t(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions);
}

/**
 * ページ全体の文字列を差し替え、`lang` と `<title>` も合わせる。
 * `lang` を実際の表示言語に合わせないと、読み上げの言語が食い違う。
 */
export function localizePage(titleKey) {
  document.documentElement.lang = chrome.i18n.getUILanguage();

  for (const node of document.querySelectorAll('[data-i18n]')) {
    const message = t(node.dataset.i18n);
    if (message) node.textContent = message;
  }

  for (const node of document.querySelectorAll('[data-i18n-title]')) {
    const message = t(node.dataset.i18nTitle);
    if (message) node.title = message;
  }

  for (const node of document.querySelectorAll('[data-i18n-alt]')) {
    const message = t(node.dataset.i18nAlt);
    if (message) node.alt = message;
  }

  if (titleKey) {
    const message = t(titleKey);
    if (message) document.title = message;
  }
}
