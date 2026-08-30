import { localizePage, t } from '../shared/i18n.js';
import { getAimModeShortcut } from '../shared/commands.js';

localizePage('extName');

/*
 * ショートカットキーの表記は、実際の割り当てから作る。
 * manifest の suggested_key は希望でしかなく、衝突すれば割り当てられないし、
 * ユーザーが変更することもある。直書きすると表示が嘘になる。
 */
const shortcut = await getAimModeShortcut();
document.querySelector('#shortcut').textContent = shortcut
  ? t('popupShortcut', [shortcut])
  : t('popupShortcutNone');

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
    response = await chrome.runtime.sendMessage({ type: 'screink:toggle-aim-mode' });
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
