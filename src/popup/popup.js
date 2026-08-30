import { localizePage, setLanguage, t } from '../shared/i18n.js';
import { getAimModeShortcut } from '../shared/commands.js';
import { getSettings } from '../shared/settings.js';

/*
 * まずブラウザのUI言語で組み立てる。HTML に書いてある既定の文言は英語なので、
 * 設定の読み込み（非同期）を待ってから差し替えると、日本語の環境で英語が一瞬見える。
 */
localizePage('extName');

// 表示言語はオプション設定に従う。読めなければブラウザのUI言語のまま進む。
setLanguage((await getSettings().catch(() => ({}))).uiLanguage);
localizePage('extName');

/*
 * ショートカットキーの表記は、実際の割り当てから作る。
 * manifest の suggested_key は希望でしかなく、衝突すれば割り当てられないし、
 * ユーザーが変更することもある。直書きすると表示が嘘になる。
 *
 * 取得できるまでは「未設定」として出しておく（英語のまま置くより実態に近い）。
 */
const shortcutText = document.querySelector('#shortcut');
shortcutText.textContent = t('popupShortcutNone');

const shortcut = await getAimModeShortcut();
if (shortcut) shortcutText.textContent = t('popupShortcut', [shortcut]);

const startButton = document.querySelector('#start');
const statusText = document.querySelector('#status');

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
