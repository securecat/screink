import { localizePage, t } from '../shared/i18n.js';

localizePage('extName');

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
