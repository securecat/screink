/**
 * 表示言語の決定と、拡張ページの文字列の差し替え。
 *
 * 文言は `chrome.i18n` ではなく `messages.js` の辞書から引く。
 * `chrome.i18n.getMessage()` はブラウザのUI言語で固定されていて、実行時に
 * 切り替える手段が無い。オプション設定で言語を選べるようにするため、
 * 引く側を自前にしている。
 *
 * ビルド工程を持たないので、HTML 側に `data-i18n` を書いておき、
 * 読み込み時に辞書の文言で置き換える。
 *
 *   <p data-i18n="popupStart"></p>          -> textContent を差し替え
 *   <a data-i18n-title="popupOpenOptions">  -> title 属性を差し替え
 *
 * `innerHTML` を使わないのは拡張ページでも同じ方針にしておくため
 * （content script 側は Trusted Types のため必須。仕様書 §4.4）。
 */

import { MESSAGES } from './messages.js';

/** 設定が無いときに使う言語。ブラウザのUI言語が日本語なら日本語、それ以外は英語。 */
export function detectUiLanguage() {
  return /^ja(-|$)/i.test(chrome.i18n.getUILanguage()) ? 'ja' : 'en';
}

/** 設定値（'en' / 'ja' / 未設定）を、実際に使う言語へ落とす。 */
export function resolveLanguage(value) {
  return value === 'en' || value === 'ja' ? value : detectUiLanguage();
}

let language = detectUiLanguage();

export function getLanguage() {
  return language;
}

/**
 * 表示言語を切り替える。反映は次の `localizePage()` / `t()` から。
 * 設定を読んだ直後（ページを組み立てる前）に呼ぶ。
 */
export function setLanguage(value) {
  language = resolveLanguage(value);
}

/**
 * 差し込みは chrome.i18n と同じ形にしてある。
 *   t('optionsShortcutBody', ['Alt+Shift+S']) -> "Alt+Shift+S enters aim mode. ..."
 */
export function t(key, substitutions = []) {
  const template = MESSAGES[language]?.[key] ?? MESSAGES.en[key] ?? '';
  return substitutions.reduce(
    (text, value, index) => text.split(`$${index + 1}`).join(value),
    template,
  );
}

/**
 * ページ全体の文字列を差し替え、`lang` と `<title>` も合わせる。
 * `lang` を実際の表示言語に合わせないと、読み上げの言語が食い違う。
 *
 * 言語を切り替えたときは、もう一度呼べばページ全体が入れ替わる。
 */
export function localizePage(titleKey) {
  document.documentElement.lang = language;

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
