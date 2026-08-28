import { DEFAULT_SETTINGS, getSettings, saveSetting, resetSettings } from '../shared/settings.js';

const form = document.querySelector('#settings-form');
const statusText = document.querySelector('#status');
const resetButton = document.querySelector('#reset');
const shortcutsButton = document.querySelector('#open-shortcuts');

const numberFields = {
  qrRegionSize: document.querySelector('#qr-region-size'),
};

const checkboxFields = {
  showRegionOutline: document.querySelector('#show-region-outline'),
  openCaptureInTab: document.querySelector('#open-capture-in-tab'),
};

/**
 * ステータスメッセージを出したきっかけの要素。
 * ユーザーの注視が別のコントロールへ移ったことが明白になった時点で消す。
 * 時間経過による自動消去はしない。
 */
let statusOwner = null;

function setStatus(message, owner = null) {
  statusText.textContent = message;
  statusOwner = owner;
}

function populate(settings) {
  numberFields.qrRegionSize.value = String(settings.qrRegionSize);
  checkboxFields.showRegionOutline.checked = settings.showRegionOutline;
  checkboxFields.openCaptureInTab.checked = settings.openCaptureInTab;
}

for (const [key, input] of Object.entries(numberFields)) {
  input.addEventListener('change', async () => {
    const requested = input.value;
    const saved = await saveSetting(key, requested);
    // 範囲外の入力は丸められる。丸めた結果を必ず画面へ返す
    input.value = String(saved);
    if (String(saved) !== requested.trim()) {
      setStatus(`入力できる範囲に合わせて ${saved} px として保存しました。`, input);
    } else {
      setStatus(`${saved} px として保存しました。`, input);
    }
  });
}

for (const [key, input] of Object.entries(checkboxFields)) {
  input.addEventListener('change', async () => {
    await saveSetting(key, input.checked);
    setStatus(input.checked ? 'on にして保存しました。' : 'off にして保存しました。', input);
  });
}

resetButton.addEventListener('click', async () => {
  const settings = await resetSettings();
  populate(settings);
  setStatus('すべての設定を既定値に戻しました。', resetButton);
});

shortcutsButton.addEventListener('click', async () => {
  // chrome:// は <a href> から開けないため、ここだけボタンで遷移させる
  await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

// 注視が別のコントロールへ移った時点でステータスを消す
form.addEventListener('focusin', (event) => {
  if (statusOwner && event.target !== statusOwner) setStatus('');
});

populate(await getSettings().catch(() => ({ ...DEFAULT_SETTINGS })));
