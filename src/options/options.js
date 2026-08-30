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
 * 保存できたことの表示は、ページを見ているあいだは消さない。
 *
 * 以前はフォーカスが他のコントロールへ移った時点で消していたが、
 * 消すこと自体がレイアウトを動かし、直後のボタンを押そうとした瞬間に
 * 位置がずれて押せない、という不具合になっていた。
 * 表示はラベルと同じ行にあり、残っていても邪魔にならない。
 */
for (const [key, input] of Object.entries(checkboxFields)) {
  input.addEventListener('change', async () => {
    await saveSetting(key, input.checked);
    statusText.textContent = t(input.checked ? 'optionsSavedOn' : 'optionsSavedOff');
  });
}

/*
 * ページから離れたら消す。
 * 次に戻ってきたときに、いつのものとも分からない結果が残っていない状態にする。
 * 離れているあいだの消去なので、操作の瞬間にレイアウトが動くことはない。
 */
window.addEventListener('blur', () => {
  statusText.textContent = '';
});

shortcutsButton.addEventListener('click', async () => {
  // chrome:// は <a href> から開けないため、ここだけボタンで遷移させる
  await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});


populate(await getSettings().catch(() => ({ ...DEFAULT_SETTINGS })));
