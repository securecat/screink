import { DEFAULT_SETTINGS, getSettings, saveSetting } from '../shared/settings.js';
import { localizePage, t } from '../shared/i18n.js';
import { getAimModeShortcut } from '../shared/commands.js';

localizePage('optionsTitle');

// ショートカットキーの表記は実際の割り当てから作る（popup.js と同じ理由）
const shortcut = await getAimModeShortcut();
document.querySelector('#shortcut').textContent = shortcut
  ? t('optionsShortcutBody', [shortcut])
  : t('optionsShortcutNone');

const statusText = document.querySelector('#status');
const shortcutsButton = document.querySelector('#open-shortcuts');

const checkboxFields = {
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
  checkboxFields.openCaptureInTab.checked = settings.openCaptureInTab;
}

for (const [key, input] of Object.entries(checkboxFields)) {
  input.addEventListener('change', async () => {
    await saveSetting(key, input.checked);
    setStatus(t(input.checked ? 'optionsSavedOn' : 'optionsSavedOff'), input);
  });
}

shortcutsButton.addEventListener('click', async () => {
  // chrome:// は <a href> から開けないため、ここだけボタンで遷移させる
  await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

// 注視が別のコントロールへ移った時点でステータスを消す
document.addEventListener('focusin', (event) => {
  if (statusOwner && event.target !== statusOwner) setStatus('');
});

populate(await getSettings().catch(() => ({ ...DEFAULT_SETTINGS })));
