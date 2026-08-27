const startButton = document.querySelector('#start');
const statusText = document.querySelector('#status');

function describeFailure(response) {
  switch (response?.reason) {
    case 'no-active-tab':
      return 'アクティブなタブを特定できませんでした。';
    case 'injection-failed':
      return 'このページでは照準モードを使えません。Chrome の設定ページや拡張機能ページ、Chrome ウェブストアでは動作しません。';
    default:
      return '照準モードを開始できませんでした。';
  }
}

startButton.addEventListener('click', async () => {
  // 進行中であることを伝える。メッセージは自動では消さない。
  statusText.textContent = '照準モードを開始しています…';

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
