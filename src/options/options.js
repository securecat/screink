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

function populate(settings) {
  checkboxFields.openCaptureInTab.checked = settings.openCaptureInTab;
}

/*
 * 保存できたことの表示は消さず、次の操作の結果で置き換える。
 *
 * 以前はフォーカスが他のコントロールへ移った時点で消していたが、
 * 消すこと自体がレイアウトを動かし、直後のボタンを押そうとした瞬間に
 * 位置がずれて押せない、という不具合になっていた。
 * 表示はラベルと同じ行に置いてあり、残っていても邪魔にならないうえ、
 * 現在の状態を正しく述べているので、消す理由がない。
 */
for (const [key, input] of Object.entries(checkboxFields)) {
  input.addEventListener('change', async () => {
    await saveSetting(key, input.checked);
    statusText.textContent = t(input.checked ? 'optionsSavedOn' : 'optionsSavedOff');
  });
}

shortcutsButton.addEventListener('click', async () => {
  // chrome:// は <a href> から開けないため、ここだけボタンで遷移させる
  await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});


populate(await getSettings().catch(() => ({ ...DEFAULT_SETTINGS })));
