import { localizePage, setLanguage, t } from '../shared/i18n.js';
import { getSettings, saveSetting } from '../shared/settings.js';

/*
 * まずブラウザのUI言語で組み立てる。HTML に書いてある既定の文言は英語なので、
 * 設定の読み込み（非同期）を待ってから差し替えると、日本語の環境で英語が一瞬見える。
 */
localizePage('extName');

const startButton = document.querySelector('#start');
const statusText = document.querySelector('#status');

/*
 * ダイレクトリンク。照準モードを開始する前に決められるよう、
 * オプションページではなくここに置いている（使うたびに切り替わりうる設定のため）。
 */
const directLink = document.querySelector('#direct-link');

/**
 * ユーザーがチェックボックスを操作したか。
 *
 * ポップアップは開いた直後に押される。設定の読み込み（この下の await）より先に
 * 押されることもあり、そのとき読み込み結果で状態を上書きすると、押したはずの
 * チェックが黙って戻る。操作されていたら上書きしない。
 */
let touched = false;

/*
 * 操作を受け付ける準備は、設定の読み込みより先に済ませる。
 * await の後ろに回すと「押せるのに何も起きない」瞬間ができる。
 */
directLink.addEventListener('change', async () => {
  touched = true;
  try {
    await saveSetting('directLink', directLink.checked);
  } catch (error) {
    // 保存できなければ、チェックの見た目を実際の状態へ戻す
    directLink.checked = !directLink.checked;
    statusText.textContent = t('popupSaveFailed');
    console.warn('[screink] 設定を保存できませんでした:', error);
  }
});

function describeFailure(response) {
  switch (response?.reason) {
    case 'no-active-tab':
      return t('errorNoTab');
    case 'injection-failed':
      return t('errorInjection');
    default:
      return t('errorStartFailed');
  }
}

startButton.addEventListener('click', async () => {
  // 進行中であることを伝える。メッセージは自動では消さない。
  statusText.textContent = t('popupStarting');

  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: 'screink:start-aim-mode' });
  } catch (error) {
    response = { ok: false, reason: 'messaging-failed', detail: String(error) };
  }

  if (response?.ok) {
    // 照準モードに入ったらポップアップは邪魔なので閉じる
    window.close();
    return;
  }

  statusText.textContent = describeFailure(response);
});

/*
 * ショートカットキーの案内はここには置かない。
 * 割り当てた本人はそのキーを知っているし、割り当てられること自体は
 * オプション設定に書いてある。ポップアップは開始の操作に絞る。
 */

// 表示言語はオプション設定に従う。読めなければブラウザのUI言語のまま進む。
const settings = await getSettings().catch(() => ({}));
setLanguage(settings.uiLanguage);
localizePage('extName');
if (!touched) directLink.checked = Boolean(settings.directLink);
